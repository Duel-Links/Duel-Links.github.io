const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('.')); // 提供静态文件（index.html等）

// ---------- 文件路径 ----------
const USERS_FILE = path.join(__dirname, 'users.json');
const DATA_DIR = path.join(__dirname, 'data');
const TODOS_FILE = path.join(DATA_DIR, 'data.json');

// 确保data目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- 文件大小监控（超过1MB轮转） ----------
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

function rotateIfNeeded(filePath) {
    try {
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_FILE_SIZE) {
            const backup = filePath + '.' + Date.now() + '.bak';
            fs.renameSync(filePath, backup);
            console.log(`[轮转] ${filePath} 已重命名为 ${backup}`);
            // 新建空文件
            fs.writeFileSync(filePath, '[]', 'utf8');
        }
    } catch (err) {
        // 文件不存在则忽略
    }
}

// ---------- 读写JSON辅助 ----------
function readJSON(file, defaultVal = []) {
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return defaultVal;
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    // 写入后检查大小
    rotateIfNeeded(file);
}

// ---------- 数据操作 ----------
function getUsers() { return readJSON(USERS_FILE); }
function getTodos() { return readJSON(TODOS_FILE); }
function setUsers(u) { writeJSON(USERS_FILE, u); }
function setTodos(t) { writeJSON(TODOS_FILE, t); }

// 获取下一个ID
function getNextId(collection) {
    if (!collection || collection.length === 0) return 1;
    return Math.max(...collection.map(item => item.id)) + 1;
}

// ---------- 初始化默认数据 ----------
function initData() {
    // 初始化用户和角色
    let users = getUsers();
    if (users.length === 0) {
        // 默认角色（合并到users中，用role对象表示）
        const defaultRoles = [
            { id: 1, name: '管理员', level: 0 },
            { id: 2, name: '领导', level: 1 },
            { id: 3, name: '经理', level: 2 },
            { id: 4, name: '主管', level: 3 },
            { id: 5, name: '组长', level: 4 },
            { id: 6, name: '员工', level: 5 }
        ];
        const defaultUsers = [
            { id: 1, username: 'admin', password: 'admin123', email: 'admin@demo.com', roleId: 1 },
            { id: 2, username: 'leader', password: 'leader123', email: 'leader@demo.com', roleId: 2 },
            { id: 3, username: 'manager', password: 'mgr123', email: 'manager@demo.com', roleId: 3 },
            { id: 4, username: 'supervisor', password: 'sup123', email: 'sup@demo.com', roleId: 4 },
            { id: 5, username: 'groupleader', password: 'gl123', email: 'gl@demo.com', roleId: 5 },
            { id: 6, username: 'employee', password: 'emp123', email: 'emp@demo.com', roleId: 6 }
        ];
        // 将角色和用户合并到一个文件中，用特殊字段区分？这里简单存储为 { roles, users }
        const combined = { roles: defaultRoles, users: defaultUsers };
        writeJSON(USERS_FILE, combined);
    }

    // 初始化待办
    let todos = getTodos();
    if (todos.length === 0) {
        const now = new Date();
        const sampleTodos = [
            {
                id: 1,
                title: '项目启动会议',
                urgency: 'important',
                steps: ['准备材料', '召开会议', '形成纪要'],
                currentStep: 0,
                startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 10, 0).toISOString(),
                endTime: new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 12, 0).toISOString(),
                repeatType: 'once',
                repeatDays: [],
                reminderOffset: 15,
                reminderUnit: 'minute',
                reminderAt: 'start',
                createdBy: 1,
                createdAt: new Date().toISOString(),
                completed: false,
                completedAt: null,
                autoDeleteDays: 3
            },
            {
                id: 2,
                title: '周报提交',
                urgency: 'urgent',
                steps: ['收集数据', '撰写报告', '提交审批'],
                currentStep: 1,
                startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate()+2, 17, 0).toISOString(),
                endTime: new Date(now.getFullYear(), now.getMonth(), now.getDate()+2, 18, 0).toISOString(),
                repeatType: 'weekly',
                repeatDays: [5],
                reminderOffset: 30,
                reminderUnit: 'minute',
                reminderAt: 'end',
                createdBy: 1,
                createdAt: new Date().toISOString(),
                completed: false,
                completedAt: null,
                autoDeleteDays: 3
            }
        ];
        writeJSON(TODOS_FILE, sampleTodos);
    }
}

initData();

// ---------- 辅助：从combined文件中提取角色和用户 ----------
function getRolesAndUsers() {
    const combined = readJSON(USERS_FILE, { roles: [], users: [] });
    return combined;
}

function getRoles() { return getRolesAndUsers().roles; }
function getUsers() { return getRolesAndUsers().users; }

function saveRolesAndUsers(roles, users) {
    writeJSON(USERS_FILE, { roles, users });
}

// ---------- API ----------
// 获取所有用户（不含密码）
app.get('/api/users', (req, res) => {
    const users = getUsers();
    res.json(users.map(u => ({ ...u, password: undefined })));
});

// 获取所有角色
app.get('/api/roles', (req, res) => {
    res.json(getRoles());
});

// 创建用户
app.post('/api/users', (req, res) => {
    const { username, password, email, roleId } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    const users = getUsers();
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: '用户名已存在' });
    }
    const newUser = {
        id: getNextId(users),
        username,
        password,
        email: email || '',
        roleId: parseInt(roleId)
    };
    users.push(newUser);
    const roles = getRoles();
    saveRolesAndUsers(roles, users);
    res.status(201).json({ ...newUser, password: undefined });
});

// 更新用户
app.put('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { username, password, email, roleId } = req.body;
    const combined = getRolesAndUsers();
    let { roles, users } = combined;
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return res.status(404).json({ error: '用户不存在' });
    // 禁止修改管理员角色
    const adminRole = roles.find(r => r.name === '管理员');
    if (users[index].roleId === adminRole.id && roleId !== adminRole.id) {
        return res.status(403).json({ error: '不能修改管理员角色' });
    }
    users[index] = { ...users[index], username, password, email, roleId: parseInt(roleId) };
    saveRolesAndUsers(roles, users);
    res.json({ ...users[index], password: undefined });
});

// 删除用户
app.delete('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const combined = getRolesAndUsers();
    let { roles, users } = combined;
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const adminRole = roles.find(r => r.name === '管理员');
    if (user.roleId === adminRole.id) {
        return res.status(403).json({ error: '不能删除管理员用户' });
    }
    users = users.filter(u => u.id !== id);
    saveRolesAndUsers(roles, users);
    res.status(204).send();
});

// 创建角色
app.post('/api/roles', (req, res) => {
    const { name, level } = req.body;
    if (!name || level === undefined) {
        return res.status(400).json({ error: '角色名和层级不能为空' });
    }
    const combined = getRolesAndUsers();
    let { roles, users } = combined;
    if (roles.find(r => r.name === name)) {
        return res.status(400).json({ error: '角色名已存在' });
    }
    const newRole = { id: getNextId(roles), name, level: parseInt(level) };
    roles.push(newRole);
    saveRolesAndUsers(roles, users);
    res.status(201).json(newRole);
});

// 更新角色
app.put('/api/roles/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { name, level } = req.body;
    const combined = getRolesAndUsers();
    let { roles, users } = combined;
    const index = roles.findIndex(r => r.id === id);
    if (index === -1) return res.status(404).json({ error: '角色不存在' });
    const adminRole = roles.find(r => r.name === '管理员');
    if (id === adminRole.id) {
        return res.status(403).json({ error: '不能修改管理员角色' });
    }
    roles[index] = { ...roles[index], name, level: parseInt(level) };
    saveRolesAndUsers(roles, users);
    res.json(roles[index]);
});

// 删除角色
app.delete('/api/roles/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const combined = getRolesAndUsers();
    let { roles, users } = combined;
    const adminRole = roles.find(r => r.name === '管理员');
    if (id === adminRole.id) {
        return res.status(403).json({ error: '不能删除管理员角色' });
    }
    if (users.find(u => u.roleId === id)) {
        return res.status(400).json({ error: '有用户使用该角色，无法删除' });
    }
    roles = roles.filter(r => r.id !== id);
    saveRolesAndUsers(roles, users);
    res.status(204).send();
});

// 待办相关
app.get('/api/todos', (req, res) => {
    res.json(getTodos());
});

app.post('/api/todos', (req, res) => {
    const todo = req.body;
    if (!todo.title) return res.status(400).json({ error: '标题不能为空' });
    const todos = getTodos();
    const newTodo = {
        id: getNextId(todos),
        ...todo,
        steps: todo.steps || ['步骤1', '步骤2', '步骤3'],
        currentStep: 0,
        completed: false,
        completedAt: null,
        autoDeleteDays: todo.autoDeleteDays || 3,
        createdAt: new Date().toISOString()
    };
    todos.push(newTodo);
    setTodos(todos);
    res.status(201).json(newTodo);
});

app.put('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const todos = getTodos();
    const index = todos.findIndex(t => t.id === id);
    if (index === -1) return res.status(404).json({ error: '待办不存在' });
    const updated = { ...todos[index], ...req.body };
    todos[index] = updated;
    setTodos(todos);
    res.json(updated);
});

app.delete('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const todos = getTodos();
    setTodos(todos.filter(t => t.id !== id));
    res.status(204).send();
});

// 登录
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }
    res.json({ ...user, password: undefined });
});

// 获取当前用户信息（通过header传递userId）
app.get('/api/me', (req, res) => {
    const userId = parseInt(req.headers['x-user-id']);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ ...user, password: undefined });
});

// 修改个人信息
app.put('/api/me', (req, res) => {
    const userId = parseInt(req.headers['x-user-id']);
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { username, password, email } = req.body;
    const combined = getRolesAndUsers();
    let { roles, users } = combined;
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) return res.status(404).json({ error: '用户不存在' });
    users[index] = { ...users[index], username, password, email };
    saveRolesAndUsers(roles, users);
    res.json({ ...users[index], password: undefined });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`AI-IMS server running on http://localhost:${PORT}`);
    console.log(`数据目录: ${DATA_DIR}`);
    console.log(`用户文件: ${USERS_FILE}`);
    console.log(`待办文件: ${TODOS_FILE} (最大 ${MAX_FILE_SIZE/1024/1024}MB，超限自动轮转)`);
});
