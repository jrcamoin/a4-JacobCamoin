import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

const today = () => new Date().toISOString().slice(0, 10)

async function request(url, options) {
  const response = await fetch(url, options)
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok) {
    const error = new Error(data?.error || 'Something went wrong')
    error.status = response.status
    throw error
  } return data}

function LoginView({ onLogin }) {
  const [message, setMessage] = useState(
    new URLSearchParams(window.location.search).get('oauth') === 'failed'
      ? 'GitHub login failed. Please try again.' : '')

  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, '', '/')}, [])

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await request('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username').trim(), password: form.get('password') })
      })
      formElement.reset()
      await onLogin()
    } catch (error) {setMessage(error.message)}}

  return (
    <section className="login-card" aria-labelledby="login-heading">
      <p className="eyebrow">Todo list</p>
      <h1 id="login-heading">Log in to manage your tasks</h1>
      <p className="intro">Keep track of tasks by priority and deadline.</p>
      <form onSubmit={submit}>
        <label htmlFor="username">Username
          <input id="username" name="username" autoComplete="username" aria-describedby="account-help" required />
        </label>
        <small id="account-help">New usernames create an account automatically.</small>
        <label htmlFor="password">Password
          <input id="password" name="password" type="password" autoComplete="current-password" aria-describedby="password-help" required />
        </label>
        <small id="password-help">Passwords are case-sensitive.</small>
        <button className="primary-action" type="submit">Log In or Create Account</button>
      </form>
      <p className="status-message error-message" role="status" aria-live="polite">{message}</p>
      <div className="oauth-divider" aria-hidden="true"><span>or</span></div>
      <a className="github-button" href="/auth/github"><span aria-hidden="true">◆</span> Continue with GitHub</a>
      <p className="privacy-note">Your tasks are visible only to your account.</p>
    </section>
  )
}

function TodoForm({ editingTodo, onCancel, onSave }) {
  const [task, setTask] = useState('')
  const [priority, setPriority] = useState('medium')
  const [creationDate, setCreationDate] = useState(today())
  const taskInput = useRef(null)

  useEffect(() => {
    setTask(editingTodo?.task || '')
    setPriority(editingTodo?.priority || 'medium')
    setCreationDate(editingTodo?.creationDate || today())
    if (editingTodo) taskInput.current?.focus()
  }, [editingTodo])

  function submit(event) {
    event.preventDefault()
    onSave({ task: task.trim(), priority, creationDate })}

  return (
    <section className="form-card" aria-labelledby="form-heading">
      <h2 id="form-heading">{editingTodo ? 'Edit todo' : 'Add a todo'}</h2>
      <form onSubmit={submit}>
        <label htmlFor="task">Task description
          <textarea ref={taskInput} id="task" rows="3" maxLength="200" placeholder="What needs to be done?" value={task} onChange={event => setTask(event.target.value)} required />
        </label>
        <div className="field-grid">
          <label htmlFor="priority">Priority
            <select id="priority" value={priority} onChange={event => setPriority(event.target.value)} required>
              <option value="high">High - 1 day</option>
              <option value="medium">Medium - 3 days</option>
              <option value="low">Low - 7 days</option>
            </select>
          </label>
          <label htmlFor="creation-date">Start date
            <input id="creation-date" type="date" value={creationDate} onChange={event => setCreationDate(event.target.value)} required />
          </label>
        </div>
        <div className="form-actions">
          <button className="primary-action" type="submit">{editingTodo ? 'Save changes' : 'Add todo'}</button>
          {editingTodo && <button className="secondary outline" type="button" onClick={onCancel}>Cancel edit</button>}
        </div>
      </form>
    </section>
  )
}

function TodoRow({ todo, onEdit, onDelete }) {
  return (
    <tr>
      <td data-label="Task">{todo.task}</td>
      <td data-label="Priority"><span className={`priority-badge priority-${todo.priority}`}>{todo.priority}</span></td>
      <td data-label="Start">{todo.creationDate}</td>
      <td data-label="Deadline">{todo.deadline}</td>
      <td className="row-actions" data-label="Actions">
        <button type="button" className="edit-button" onClick={() => onEdit(todo)} aria-label={`Edit ${todo.task}`}>Edit</button>
        <button type="button" className="delete-button" onClick={() => onDelete(todo)} aria-label={`Delete ${todo.task}`}>Delete</button>
      </td>
    </tr>
  )
}

function TodoList({ todos, onEdit, onDelete }) {
  return (
    <section className="results-card" aria-labelledby="results-heading">
      <div className="section-heading">
        <div><h2 id="results-heading">Your todos</h2></div>
        <span className="count-badge" aria-live="polite">{todos.length} {todos.length === 1 ? 'task' : 'tasks'}</span>
      </div>
      {todos.length === 0 ? (
        <div className="empty-state"><span aria-hidden="true">✓</span><h3>You’re all caught up</h3><p>Add a task to start planning your week.</p></div>
      ) : (
        <div className="table-container">
          <table>
            <caption className="visually-hidden">Todos belonging to your signed-in account</caption>
            <thead><tr><th scope="col">Task</th><th scope="col">Priority</th><th scope="col">Start</th><th scope="col">Deadline</th><th scope="col">Actions</th></tr></thead>
            <tbody>{todos.map(todo => <TodoRow key={todo._id} todo={todo} onEdit={onEdit} onDelete={onDelete} />)}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Dashboard({ todos, setTodos }) {
  const [editingTodo, setEditingTodo] = useState(null)
  const [message, setMessage] = useState('')

  async function saveTodo(todo) {
    const wasEditing = Boolean(editingTodo)
    try {
      const data = await request(wasEditing ? `/api/todos/${editingTodo._id}` : '/api/todos', {
        method: wasEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(todo)})
      setTodos(data)
      setEditingTodo(null)
      setMessage(wasEditing ? 'Todo updated successfully.' : 'Todo added successfully.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function deleteTodo(todo) {
    try {
      setTodos(await request(`/api/todos/${todo._id}`, { method: 'DELETE' }))
      if (editingTodo?._id === todo._id) setEditingTodo(null)
      setMessage('Todo deleted successfully.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <div id="todo-interface">
      <div className="dashboard-heading"><div><h1>Priorities for the week</h1></div></div>
      <div>
        <TodoForm editingTodo={editingTodo} onCancel={() => { setEditingTodo(null); setMessage('') }} onSave={saveTodo} />
        <p className="status-message success-message" role="status" aria-live="polite">{message}</p>
      </div>
      <TodoList todos={todos} onEdit={todo => { setEditingTodo(todo); setMessage('Editing selected todo.') }} onDelete={deleteTodo} />
    </div>
  )
}

function App() {
  const [authenticated, setAuthenticated] = useState(null)
  const [todos, setTodos] = useState([])

  async function loadTodos() {
    try {
      setTodos(await request('/api/todos'))
      setAuthenticated(true)
    } catch (error) {
      setAuthenticated(false)
    }
  }

  useEffect(() => { loadTodos() }, [])
  useEffect(() => {
    const button = document.querySelector('#logout-button')
    button.hidden = authenticated !== true
    async function logout() {
      await request('/api/logout', { method: 'POST' })
      setTodos([])
      setAuthenticated(false)}
    
    button.addEventListener('click', logout)
    return () => button.removeEventListener('click', logout)}, [authenticated])

  if (authenticated === null) return <p className="loading-message" role="status">Loading…</p>
  return authenticated ? <Dashboard todos={todos} setTodos={setTodos} /> : <LoginView onLogin={loadTodos} />
}

createRoot(document.querySelector('#todo-root')).render(<App />)
