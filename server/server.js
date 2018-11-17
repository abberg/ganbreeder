const express = require('express')
const bodyParser = require('body-parser')
const request = require('request-promise')
const { Pool, Client } = require('pg')
const save_results = require('./save_results.js')
const port = process.argv[2] || 8888
const app = express()
const secrets= require('./secrets.js')
const knex = require('knex')(secrets.database)

const IMAGE_STATE = {
    INITIAL: 0,
    LOADING: 1
}

app.use(express.static('public'))
app.use(bodyParser.json())
app.set('view engine', 'pug')
app.set('views', 'public')

app.get('/i', async (req, res) => {
    const key = req.query.k
    if (!key) return res.sendStatus(404)
    const { id, vector, label, parent1 } = await knex.from('image').where({ key }).first()
    let pkey = null
    if (parent1 != null) {
        let res = await knex.select('key').from('image').where({ id: parent1 }).first()
        pkey = res.key
    }
    res.render('image.pug', { key, pkey })
})

app.post('/image_children', async (req, res) => {
    const key = req.body.key
    if (!key) return res.sendStatus(404)
    try {
        const { id, state, vector, label } = await knex.from('image').where({ key }).first()
        if (state == IMAGE_STATE.INITIAL) {
            console.time('make_children')
            const [ imgs, vectors, labels ] = await request({
                url: secrets.ganurl+'/children',
                method: 'POST',
                json: true,
                form: { vector: JSON.stringify(vector), label: JSON.stringify(label) }
            })
            console.timeEnd('make_children')
            await knex('image').where({ id }).update({ state: 1 })
            console.time('save_results')
            const children = await save_results({ imgs, vectors, labels, parent1: id })
            console.timeEnd('save_results')
            console.log('Got new childrennnn')
            return res.json(children)
        } else if (state == 1) {
            const children = await knex.from('image').select('key').where({ parent1: id })
            if (children.length) {
                return res.json(children)
            }
            // Children are being processed, do not request more.
            return res.json([])
        }
    } catch(err) {
        console.log('Error: /image_children', err)
        return res.sendStatus(500)
    }
})

app.get('/random', (req, res) => {
    const q = 'select key from image where parent1 is null order by random() limit 12'
    knex.raw(q).then(data => {
        const keys = data.rows.map(({key}) => key)
        res.render('random.pug', { keys })
    }).catch(err => {
        console.log('Error: /random', { err })
        return res.sendStatus(500)
    })
})

app.get('/', (req, res) => res.redirect('/random'))
app.listen(port, () => console.log('Server running on', port))