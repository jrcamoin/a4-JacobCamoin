require('dotenv').config()

const express = require('express')
const {MongoClient, ObjectId } = require('mongodb')

const app = express()
const port = process.env.PORT || 3000
const client = new MongoClient(process.env.MONGODB_URI)
const session = require('express-session')
const { MongoStore } = require('connect-mongo')
const bcrypt = require('bcrypt')
const passport = require('passport')
const GitHubStrategy = require('passport-github2').Strategy
const path = require('path')

let todosCollection
let usersCollection

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)

app.use(express.json())
app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false, saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI, dbName: 'todo_app'}),
      cookie: {
        httpOnly: true, sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24}}))

app.use(passport.initialize())
app.use(passport.session())
app.use('/vendor/pico', express.static(path.join(__dirname, 'node_modules/@picocss/pico/css')))
app.use(express.static('public'))

passport.serializeUser(function (user, done) {
  done(null, user._id.toString())})

passport.deserializeUser(async function (id, done) {
  try {
    if (!ObjectId.isValid(id)) return done(null, false)
    done(null, await usersCollection.findOne({ _id: new ObjectId(id) }))
  } catch (error) {
    done(error)}
})

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback',
    state: true
  }, async function (_accessToken, _refreshToken, profile, done) {
    try {
      const githubId = profile.id
      let user = await usersCollection.findOne({ githubId })
      if (!user) {
        const username = `github:${profile.username || githubId}`
        const result = await usersCollection.insertOne({
          githubId, username, githubUsername: profile.username || null, authenticationProvider: 'github'})
        user = { _id: result.insertedId, githubId, username }}
      done(null, user)
    } catch (error) {
      done(error)}
  }))
}


const calculateDeadline = function(creationDate, priority){
  const deadline = new Date(`${creationDate}T00:00:00Z`)
  const daysByPriority = { high: 1, medium: 3, low: 7}
  deadline.setUTCDate(
    deadline.getUTCDate() + daysByPriority[priority])
  return deadline.toISOString().slice(0,10)}

function requireLogin(request, response, next) {
    if (!request.session.userId) {
      return response.status(401).json({
        error: 'Please log in'
      })}
    next()}

app.post('/api/login', async function (request, response) {
    const username = request.body.username?.trim().toLowerCase()
    const password = request.body.password

    if (!username || !password) {
      return response.status(400).json({
        error: 'Username and password are required'})}

    try {let user = await usersCollection.findOne({ username })

      if (!user) {
        const passwordHash = await bcrypt.hash(password, 12)
        const result = await usersCollection.insertOne({username, passwordHash})

        user = {_id: result.insertedId, username}
          } else {
        const passwordMatches = await bcrypt.compare(
          password,
          user.passwordHash
        )

        if (!passwordMatches) {
          return response.status(401).json({
            error: 'Incorrect password'
          })
        }
      }

      request.session.userId = user._id.toString()
      request.session.username = user.username

      response.json({
        username: user.username
      })
    } catch (error) {
      console.error('Failed to log in:', error)
      response.status(500).json({
        error: 'Failed to log in'
      })
    }
  })

app.get('/auth/github', function (request, response, next) {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return response.status(503).send('GitHub login is not configured yet.')
  }
  passport.authenticate('github', { scope: [] })(request, response, next)
})

app.get('/auth/github/callback', function (request, response, next) {
  passport.authenticate('github', { failureRedirect: '/?oauth=failed' }, function (error, user) {
    if (error || !user) return response.redirect('/?oauth=failed')
    request.logIn(user, function (loginError) {
      if (loginError) return next(loginError)
      request.session.userId = user._id.toString()
      request.session.username = user.username
      response.redirect('/')
    })
  })(request, response, next)
})

app.post('/api/logout', function (request, response) {
  request.session.destroy(function (error) {
    if (error) return response.status(500).json({ error: 'Failed to log out' })
    response.clearCookie('connect.sid')
    response.status(204).end()
  })
})

app.get('/api/todos', requireLogin, async function (request, response) {
    try {
      const todos = await todosCollection.find({ownerId: request.session.userId}).toArray()
      response.json(todos)
    } catch (error) {
      console.error('Failed to retrieve todos:', error)
      response.status(500).json({
        error: 'Failed to retrieve todos'
      })
    }
  })


app.post('/api/todos', requireLogin, async function (request, response) {
    const incomingTodo = request.body
    const validPriorities = ['high', 'medium', 'low']

    if (
      !incomingTodo.task ||
      !incomingTodo.creationDate ||
      !validPriorities.includes(incomingTodo.priority)
    ) {
      response.status(400).json({
        error: 'Please provide valid todo information'
      })
      return
    }

    const newTodo = {
      ownerId: request.session.userId,
      task: incomingTodo.task.trim(),
      priority: incomingTodo.priority,
      creationDate: incomingTodo.creationDate,
      deadline: calculateDeadline(
        incomingTodo.creationDate,
        incomingTodo.priority
      )
    }

    try {
      await todosCollection.insertOne(newTodo)
      const todos = await todosCollection.find({ownerId: request.session.userId}).toArray()
      response.status(201).json(todos)
    } catch (error) {
      console.error('Failed to add todo:', error)
      response.status(500).json({
        error: 'Failed to add todo'
      })
    }
  })

app.delete('/api/todos/:id', requireLogin, async function (request, response) {
    try {
      if (!ObjectId.isValid(request.params.id)) {
        return response.status(400).json({
          error: 'Invalid todo ID'
        })
      }

      const result = await todosCollection.deleteOne({
        _id: new ObjectId(request.params.id),
        ownerId: request.session.userId
      })

      if (result.deletedCount === 0) {
        return response.status(404).json({
          error: 'Todo not found'
        })
      }

      const todos = await todosCollection.find({ownerId: request.session.userId}).toArray()
      response.json(todos)
    } catch (error) {
      console.error('Failed to delete todo:', error)
      response.status(500).json({
        error: 'Failed to delete todo'
      })
    }
  })

app.put('/api/todos/:id', requireLogin, async function (request, response) {
    const { task, priority, creationDate } = request.body
    const validPriorities = ['high', 'medium', 'low']

    if (
      !ObjectId.isValid(request.params.id) ||
      !task?.trim() ||
      !creationDate ||
      !validPriorities.includes(priority)
    ) {
      return response.status(400).json({
        error: 'Please provide valid todo information'
      })
    }

    try {
      const result = await todosCollection.updateOne(
        { _id: new ObjectId(request.params.id),
          ownerId: request.session.userId},
        {
          $set: {
            task: task.trim(),
            priority,
            creationDate,
            deadline: calculateDeadline(creationDate, priority)
          }
        }
      )

      if (result.matchedCount === 0) {
        return response.status(404).json({
          error: 'Todo not found'
        })
      }

      const todos = await todosCollection.find({ownerId: request.session.userId}).toArray()
      response.json(todos)
    } catch (error) {
      console.error('Failed to update todo:', error)
      response.status(500).json({
        error: 'Failed to update todo'
      })
    }
  })

async function startServer() {
  await client.connect()
  const database = client.db('todo_app')
  todosCollection = database.collection('todos')
  usersCollection = database.collection('users')
  await usersCollection.createIndex({ username: 1 }, { unique: true })
  await usersCollection.createIndex({ githubId: 1 }, { unique: true, sparse: true })
  app.listen(port, function () {
    console.log(`Server listening on port ${port}`)
  })
}

startServer().catch(function (error) {
  console.error('Failed to connect to MongoDB:', error)
  process.exit(1)
})
