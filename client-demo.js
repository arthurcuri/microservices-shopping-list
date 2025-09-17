#!/usr/bin/env node

/**
 * Cliente de Demonstração - Microservices Shopping List
 * 
 * Este cliente demonstra todas as funcionalidades da aplicação:
 * - Registro de usuário
 * - Login
 * - Busca de itens
 * - Criação de lista
 * - Adição de itens à lista
 * - Visualização do dashboard
 * 
 * Para executar: node client-demo.js
 */

const axios = require('axios');
const readline = require('readline');

// Configurações da API
const API_BASE = 'http://localhost:3000/api';  // Via API Gateway
const DIRECT_SERVICES = {
    user: 'http://localhost:3001',
    product: 'http://localhost:3003', 
    list: 'http://localhost:3002'
};

// Cliente de demonstração
class ShoppingListClient {
    constructor() {
        this.token = null;
        this.user = null;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    // Utilitário para fazer requisições com token
    async request(method, url, data = null, useDirectService = false) {
        const config = {
            method,
            url,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        };

        if (this.token) {
            config.headers.Authorization = `Bearer ${this.token}`;
        }

        if (data) {
            config.data = data;
        }

        try {
            const response = await axios(config);
            return response.data;
        } catch (error) {
            if (error.response) {
                throw new Error(`${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    // Utilitário para perguntas ao usuário
    question(prompt) {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }

    // 1. Registro de usuário
    async registerUser() {
        console.log('\n=== REGISTRO DE USUÁRIO ===');
        
        const email = await this.question('Email: ');
        const password = await this.question('Senha: ');
        const username = await this.question('Nome de usuário: ');
        const firstName = await this.question('Primeiro nome: ');
        const lastName = await this.question('Sobrenome: ');

        try {
            const response = await this.request('POST', `${API_BASE}/auth/register`, {
                email,
                password,
                username,
                firstName,
                lastName
            });

            console.log('Usuário registrado com sucesso!');
            console.log(`ID: ${response.data.user.id}`);
            console.log(`Email: ${response.data.user.email}`);
            
            // Salvar token automaticamente
            this.token = response.data.token;
            this.user = response.data.user;
            
            return response;
        } catch (error) {
            console.error('Erro no registro:', error.message);
            throw error;
        }
    }

    // 2. Login
    async login() {
        console.log('\n=== LOGIN ===');
        
        const identifier = await this.question('Email ou username: ');
        const password = await this.question('Senha: ');

        try {
            const response = await this.request('POST', `${API_BASE}/auth/login`, {
                identifier,
                password
            });

            console.log('Login realizado com sucesso!');
            console.log(`Bem-vindo, ${response.data.user.firstName}!`);
            
            this.token = response.data.token;
            this.user = response.data.user;
            
            return response;
        } catch (error) {
            console.error('Erro no login:', error.message);
            throw error;
        }
    }

    // 3. Busca de itens
    async searchItems() {
        console.log('\n=== BUSCA DE ITENS ===');
        
        try {
            // Listar todos os itens
            console.log('Listando todos os itens disponíveis...');
            const itemsResponse = await this.request('GET', `${API_BASE}/items`);
            
            if (itemsResponse.success && itemsResponse.data.length > 0) {
                console.log(`\n${itemsResponse.data.length} itens encontrados:`);
                itemsResponse.data.forEach((item, index) => {
                    console.log(`${index + 1}. ${item.name} - R$ ${item.price}`);
                    console.log(`   Categoria: ${item.category}`);
                    console.log(`   Descrição: ${item.description || 'Sem descrição'}`);
                    console.log(`   ID: ${item.id}\n`);
                });
                
                return itemsResponse.data;
            } else {
                console.log('Nenhum item encontrado. Vamos criar alguns!');
                await this.createSampleItems();
                return this.searchItems(); // Recursão para mostrar os itens criados
            }
        } catch (error) {
            console.error('Erro na busca de itens:', error.message);
            throw error;
        }
    }

    // Criar itens de exemplo
    async createSampleItems() {
        console.log('\nCriando itens de exemplo...');
        
        const sampleItems = [
            {
                name: "Leite Integral",
                price: 4.50,
                category: "laticínios",
                description: "Leite integral 1L"
            },
            {
                name: "Pão de Forma",
                price: 3.80,
                category: "padaria", 
                description: "Pão de forma integral"
            },
            {
                name: "Arroz Branco",
                price: 8.90,
                category: "grãos",
                description: "Arroz branco tipo 1 - 5kg"
            }
        ];

        for (const item of sampleItems) {
            try {
                await this.request('POST', `${API_BASE}/items`, item);
                console.log(`Criado: ${item.name}`);
            } catch (error) {
                console.log(`Erro ao criar ${item.name}: ${error.message}`);
            }
        }
    }

    // 4. Criação de lista
    async createList() {
        console.log('\n=== CRIAÇÃO DE LISTA ===');
        
        const name = await this.question('Nome da lista: ');
        const description = await this.question('Descrição (opcional): ');

        try {
            const response = await this.request('POST', `${API_BASE}/lists`, {
                name,
                description: description || undefined
            });

            console.log('Lista criada com sucesso!');
            console.log(`Nome: ${response.data.name}`);
            console.log(`ID: ${response.data.id}`);
            
            return response.data;
        } catch (error) {
            console.error('Erro na criação da lista:', error.message);
            throw error;
        }
    }

    // 5. Adição de itens à lista
    async addItemsToList(listId, availableItems) {
        console.log('\n=== ADIÇÃO DE ITENS À LISTA ===');
        
        if (!availableItems || availableItems.length === 0) {
            console.log('Nenhum item disponível para adicionar.');
            return;
        }

        console.log('\nItens disponíveis:');
        availableItems.forEach((item, index) => {
            console.log(`${index + 1}. ${item.name} - R$ ${item.price}`);
        });

        while (true) {
            const choice = await this.question('\nEscolha um item (número) ou "s" para sair: ');
            
            if (choice.toLowerCase() === 's') {
                break;
            }

            const itemIndex = parseInt(choice) - 1;
            if (itemIndex >= 0 && itemIndex < availableItems.length) {
                const selectedItem = availableItems[itemIndex];
                const quantity = await this.question('Quantidade: ');
                const notes = await this.question('Observações (opcional): ');

                try {
                    const response = await this.request('POST', `${API_BASE}/lists/${listId}/items`, {
                        itemId: selectedItem.id,
                        quantity: parseInt(quantity) || 1,
                        notes: notes || undefined
                    });

                    console.log(`${selectedItem.name} adicionado à lista!`);
                } catch (error) {
                    console.error('Erro ao adicionar item:', error.message);
                }
            } else {
                console.log('Opção inválida.');
            }
        }
    }

    // 6. Visualização do dashboard
    async viewDashboard() {
        console.log('\n=== DASHBOARD ===');
        
        try {
            const response = await this.request('GET', `${API_BASE}/dashboard`);
            
            console.log('Resumo da conta:');
            if (response.users && response.users.data) {
                console.log(`Total de usuários: ${response.users.data.length}`);
            }
            
            if (response.products && response.products.data) {
                console.log(`Total de produtos: ${response.products.data.length}`);
            }
            
            if (response.categories && response.categories.data) {
                console.log(`Categorias disponíveis: ${response.categories.data.length}`);
            }

            // Listar suas listas
            console.log('\nSuas listas:');
            const listsResponse = await this.request('GET', `${API_BASE}/lists`);
            
            if (listsResponse.success && listsResponse.data.length > 0) {
                listsResponse.data.forEach((list, index) => {
                    console.log(`${index + 1}. ${list.name}`);
                    console.log(`   Descrição: ${list.description || 'Sem descrição'}`);
                    console.log(`   Criada em: ${new Date(list.createdAt).toLocaleDateString('pt-BR')}`);
                    console.log(`   Itens: ${list.items?.length || 0}\n`);
                });
            } else {
                console.log('Você ainda não tem listas criadas.');
            }
            
            return response;
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error.message);
            throw error;
        }
    }

    // Menu principal
    async showMenu() {
        console.log('\n=== MENU PRINCIPAL ===');
        console.log('1. Registrar novo usuário');
        console.log('2. Fazer login');
        console.log('3. Buscar itens');
        console.log('4. Criar lista');
        console.log('5. Ver dashboard');
        console.log('6. Demo completo');
        console.log('0. Sair');
        
        const choice = await this.question('\nEscolha uma opção: ');
        return choice;
    }

    // Demo completo automatizado
    async runCompleteDemo() {
        console.log('\n=== DEMO COMPLETO AUTOMATIZADO ===');
        console.log('Este demo irá demonstrar todas as funcionalidades...\n');

        try {
            // 1. Registro ou Login
            if (!this.token) {
                console.log('Você precisa estar logado. Escolha uma opção:');
                const authChoice = await this.question('1. Registrar novo usuário\n2. Fazer login\nEscolha: ');
                
                if (authChoice === '1') {
                    await this.registerUser();
                } else {
                    await this.login();
                }
            }

            // 2. Buscar itens
            const items = await this.searchItems();

            // 3. Criar lista
            const list = await this.createList();

            // 4. Adicionar itens à lista
            if (items && items.length > 0) {
                await this.addItemsToList(list.id, items);
            }

            // 5. Ver dashboard
            await this.viewDashboard();

            console.log('\nDemo completo finalizado com sucesso!');
            
        } catch (error) {
            console.error('Erro no demo:', error.message);
        }
    }

    // Verificar saúde dos serviços
    async checkHealth() {
        console.log('\n=== VERIFICAÇÃO DE SAÚDE DOS SERVIÇOS ===');
        
        const services = [
            { name: 'API Gateway', url: 'http://localhost:3000/health' },
            { name: 'User Service', url: 'http://localhost:3001/health' },
            { name: 'List Service', url: 'http://localhost:3002/health' },
            { name: 'Product Service', url: 'http://localhost:3003/health' }
        ];

        for (const service of services) {
            try {
                const response = await axios.get(service.url, { timeout: 3000 });
                console.log(`✅ ${service.name}: ${response.data.status || 'OK'}`);
            } catch (error) {
                console.log(`❌ ${service.name}: INDISPONÍVEL`);
            }
        }
    }

    // Executar cliente
    async run() {
        console.log('=== CLIENTE DE DEMONSTRAÇÃO - MICROSERVICES SHOPPING LIST ===');
        console.log('Este cliente demonstra todas as funcionalidades da aplicação.\n');

        // Verificar saúde dos serviços
        await this.checkHealth();

        while (true) {
            try {
                const choice = await this.showMenu();
                
                switch (choice) {
                    case '1':
                        await this.registerUser();
                        break;
                    case '2':
                        await this.login();
                        break;
                    case '3':
                        await this.searchItems();
                        break;
                    case '4':
                        if (!this.token) {
                            console.log('Você precisa estar logado para criar listas.');
                            continue;
                        }
                        await this.createList();
                        break;
                    case '5':
                        if (!this.token) {
                            console.log('Você precisa estar logado para ver o dashboard.');
                            continue;
                        }
                        await this.viewDashboard();
                        break;
                    case '6':
                        await this.runCompleteDemo();
                        break;
                    case '0':
                        console.log('Até logo!');
                        this.rl.close();
                        return;
                    default:
                        console.log('Opção inválida.');
                }
            } catch (error) {
                console.error('Erro:', error.message);
            }
        }
    }
}

// Executar o cliente se for chamado diretamente
if (require.main === module) {
    const client = new ShoppingListClient();
    client.run().catch(console.error);
}

module.exports = ShoppingListClient;