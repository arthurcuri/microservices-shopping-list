const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const JsonDatabase = require('../../shared/JsonDatabase');
const serviceRegistry = require('../../shared/serviceRegistry');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');

const PORT = 3002;
const SERVICE_NAME = 'list-service';
const DB_DIR = './database';
const COLLECTION = 'lists';

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Banco de dados
const db = new JsonDatabase(DB_DIR, COLLECTION);

// Middleware de autenticação que usa o User Service
async function authenticateJWT(req, res, next) {
    const authHeader = req.header('Authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Token obrigatório'
        });
    }

    try {
        // Descobrir User Service
        const userService = serviceRegistry.discover('user-service');
        
        // Validar token com User Service
        const response = await axios.post(`${userService.url}/auth/validate`, {
            token: authHeader.replace('Bearer ', '')
        }, { timeout: 5000 });

        if (response.data.success) {
            req.user = response.data.data.user;
            next();
        } else {
            res.status(401).json({
                success: false,
                message: 'Token inválido'
            });
        }
    } catch (error) {
        console.error('Erro na validação do token:', error.message);
        res.status(503).json({
            success: false,
            message: 'Serviço de autenticação indisponível'
        });
    }
}

// Registro no Service Registry
serviceRegistry.register(SERVICE_NAME, 'localhost', PORT);

// Endpoints CRUD de listas
app.post('/lists', authenticateJWT, async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.id;
        const newList = {
            userId,
            name,
            description,
            status: 'active',
            items: [],
            summary: {
                totalItems: 0,
                purchasedItems: 0,
                estimatedTotal: 0
            }
        };
        const created = await db.create(newList);
        res.status(201).json(created);
    } catch (error) {
        console.error('Erro ao criar lista:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/lists', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const lists = await db.find({ userId });
        res.json(lists);
    } catch (error) {
        console.error('Erro ao buscar listas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/lists/:id', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const list = await db.findById(req.params.id);
        if (!list || list.userId !== userId) {
            return res.sendStatus(404);
        }
        res.json(list);
    } catch (error) {
        console.error('Erro ao buscar lista:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.put('/lists/:id', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const list = await db.findById(req.params.id);
        if (!list || list.userId !== userId) {
            return res.sendStatus(404);
        }
        const updates = {
            name: req.body.name || list.name,
            description: req.body.description || list.description
        };
        const updated = await db.update(list.id, updates);
        res.json(updated);
    } catch (error) {
        console.error('Erro ao atualizar lista:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.delete('/lists/:id', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const list = await db.findById(req.params.id);
        if (!list || list.userId !== userId) {
            return res.sendStatus(404);
        }
        await db.delete(list.id);
        res.sendStatus(204);
    } catch (error) {
        console.error('Erro ao deletar lista:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Adicionar item à lista
app.post('/lists/:id/items', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const list = await db.findById(req.params.id);
        if (!list || list.userId !== userId) {
            return res.sendStatus(404);
        }
        
        const { itemId, quantity, estimatedPrice, notes } = req.body;
        
        // Buscar informações completas do item no Product Service
        let itemDetails = null;
        try {
            const productService = serviceRegistry.discover('item-service');
            const response = await axios.get(`${productService.url}/items/${itemId}`, { timeout: 5000 });
            
            if (response.data.success) {
                itemDetails = response.data.data;
            }
        } catch (error) {
            console.error('Erro ao buscar detalhes do item:', error.message);
            return res.status(404).json({ 
                success: false,
                error: 'Item não encontrado no catálogo' 
            });
        }
        
        // Criar item da lista com informações completas
        const item = {
            itemId: itemDetails.id,
            itemName: itemDetails.name,
            itemDetails: {
                category: itemDetails.category,
                brand: itemDetails.brand,
                unit: itemDetails.unit,
                barcode: itemDetails.barcode,
                description: itemDetails.description,
                averagePrice: itemDetails.averagePrice
            },
            quantity: quantity || 1,
            unit: itemDetails.unit,
            estimatedPrice: estimatedPrice || itemDetails.averagePrice,
            purchased: false,
            notes: notes || '',
            addedAt: new Date().toISOString()
        };
        
        list.items.push(item);
        list.summary.totalItems = list.items.length;
        list.summary.estimatedTotal = list.items.reduce((sum, i) => sum + (i.estimatedPrice || 0), 0);
        
        await db.update(list.id, list);
        res.status(201).json({
            success: true,
            message: 'Item adicionado à lista com sucesso',
            data: item
        });
    } catch (error) {
        console.error('Erro ao adicionar item à lista:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro interno do servidor' 
        });
    }
});

// Atualizar item na lista
app.put('/lists/:id/items/:itemId', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const list = await db.findById(req.params.id);
        if (!list || list.userId !== userId) {
            return res.sendStatus(404);
        }
        
        const item = list.items.find(i => i.itemId === req.params.itemId);
        if (!item) {
            return res.sendStatus(404);
        }
        
        Object.assign(item, req.body);
        list.summary.purchasedItems = list.items.filter(i => i.purchased).length;
        list.summary.estimatedTotal = list.items.reduce((sum, i) => sum + (i.estimatedPrice || 0), 0);
        
        await db.update(list.id, list);
        res.json(item);
    } catch (error) {
        console.error('Erro ao atualizar item na lista:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Remover item da lista
app.delete('/lists/:id/items/:itemId', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const list = await db.findById(req.params.id);
        if (!list || list.userId !== userId) {
            return res.sendStatus(404);
        }
        
        list.items = list.items.filter(i => i.itemId !== req.params.itemId);
        list.summary.totalItems = list.items.length;
        list.summary.purchasedItems = list.items.filter(i => i.purchased).length;
        list.summary.estimatedTotal = list.items.reduce((sum, i) => sum + (i.estimatedPrice || 0), 0);
        
        await db.update(list.id, list);
        res.sendStatus(204);
    } catch (error) {
        console.error('Erro ao remover item da lista:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Resumo da lista
app.get('/lists/:id/summary', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const list = await db.findById(req.params.id);
        if (!list || list.userId !== userId) {
            return res.sendStatus(404);
        }
        res.json(list.summary);
    } catch (error) {
        console.error('Erro ao buscar resumo da lista:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Service info endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'List Service',
        version: '1.0.0',
        description: 'Microsserviço para gerenciamento de listas de compras com integração ao catálogo de produtos',
        database: 'JSON-NoSQL',
        integrations: [
            'User Service (autenticação)',
            'Product/Item Service (catálogo de produtos)'
        ],
        endpoints: [
            'GET /lists - Listar listas do usuário',
            'GET /lists/:id - Obter lista específica',
            'POST /lists - Criar nova lista',
            'PUT /lists/:id - Atualizar lista',
            'DELETE /lists/:id - Deletar lista',
            'POST /lists/:id/items - Adicionar item à lista (busca automática no catálogo)',
            'PUT /lists/:id/items/:itemId - Atualizar item na lista',
            'DELETE /lists/:id/items/:itemId - Remover item da lista',
            'GET /lists/:id/summary - Obter resumo da lista',
            'GET /health - Health check'
        ],
        authentication: 'JWT Token required for all endpoints except /, /health',
        usage: {
            addItem: {
                endpoint: 'POST /lists/:id/items',
                payload: {
                    itemId: 'string (UUID do produto no catálogo)',
                    quantity: 'number (opcional, padrão: 1)',
                    estimatedPrice: 'number (opcional, usa preço médio do catálogo)',
                    notes: 'string (opcional)'
                },
                description: 'Busca automaticamente informações do produto no catálogo'
            }
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
});

app.listen(PORT, () => {
    console.log(`${SERVICE_NAME} running on port ${PORT}`);
});