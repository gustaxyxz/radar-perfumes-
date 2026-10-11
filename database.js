// ========================================================
// BANCO DE DADOS LOCAL E GERENCIADOR DE ESTADO
// ========================================================

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'banco.json');

class Database {
    constructor() {
        this.dados = {
            ofertas: [],        // Anúncios de venda identificados
            demandas: [],       // Pedidos de compra identificados
            membrosGrupos: {},  // telefone/id -> [grupoId1, grupoId2]
            gruposInfo: {},     // grupoId -> { id, nome, totalMembros }
            matchesNotificados: [] // registros de matches já avisados
        };

        this.carregar();
    }

    carregar() {
        try {
            if (fs.existsSync(DB_PATH)) {
                const conteudo = fs.readFileSync(DB_PATH, 'utf-8');
                this.dados = JSON.parse(conteudo);
                if (!this.dados.ofertas) this.dados.ofertas = [];
                if (!this.dados.demandas) this.dados.demandas = [];
                if (!this.dados.membrosGrupos) this.dados.membrosGrupos = {};
                if (!this.dados.gruposInfo) this.dados.gruposInfo = {};
                if (!this.dados.matchesNotificados) this.dados.matchesNotificados = [];
                if (!this.dados.config) this.dados.config = {};
            } else {
                this.salvar();
            }
        } catch (erro) {
            console.error('⚠️ Erro ao carregar banco de dados local:', erro.message);
        }
    }

    salvar() {
        try {
            const dir = path.dirname(DB_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(DB_PATH, JSON.stringify(this.dados, null, 2), 'utf-8');
        } catch (erro) {
            console.error('⚠️ Erro ao salvar banco de dados:', erro.message);
        }
    }

    // ----------------------------------------------------
    // MAPA DE MEMBROS E GRUPOS (PARA VERIFICAÇÃO DE SEGURANÇA)
    // ----------------------------------------------------
    registrarGrupo(grupoId, grupoNome, participants = []) {
        this.dados.gruposInfo[grupoId] = {
            id: grupoId,
            nome: grupoNome,
            totalMembros: participants.length,
            atualizadoEm: new Date().toISOString()
        };

        for (const p of participants) {
            const rawId = p.id?._serialized || p.id || '';
            const numero = rawId.split('@')[0];
            if (!numero) continue;

            if (!this.dados.membrosGrupos[numero]) {
                this.dados.membrosGrupos[numero] = [];
            }

            if (!this.dados.membrosGrupos[numero].includes(grupoId)) {
                this.dados.membrosGrupos[numero].push(grupoId);
            }
        }

        this.salvar();
    }

    obterGruposDoUsuario(telefone) {
        if (!telefone) return [];
        const numero = String(telefone).replace(/\D/g, '');
        const gruposIds = this.dados.membrosGrupos[numero] || [];
        return gruposIds.map(id => this.dados.gruposInfo[id]?.nome || id);
    }

    verificarGruposEmComum(telefoneA, telefoneB) {
        if (!telefoneA || !telefoneB) return [];
        const numA = String(telefoneA).replace(/\D/g, '');
        const numB = String(telefoneB).replace(/\D/g, '');

        const gruposA = this.dados.membrosGrupos[numA] || [];
        const gruposB = this.dados.membrosGrupos[numB] || [];

        const emComumIds = gruposA.filter(gId => gruposB.includes(gId));
        return emComumIds.map(id => this.dados.gruposInfo[id]?.nome || id);
    }

    // ----------------------------------------------------
    // OFERTAS (VENDAS)
    // ----------------------------------------------------
    adicionarOferta(oferta) {
        if (!oferta) return null;
        const security = require('./security');
        if (security.ehNumeroBloqueado(oferta.autorTelefone, oferta.texto)) {
            console.log(`🚫 [DATABASE] Descartando oferta de contato bloqueado: ${oferta.autorTelefone}`);
            return null;
        }

        // Evita duplicar se a mensagem já foi registrada
        const existe = this.dados.ofertas.find(o => o.msgId && o.msgId === oferta.msgId);
        if (existe) return existe;

        const novaOferta = {
            id: 'OF-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase(),
            dataCriacao: new Date().toISOString(),
            status: 'ativa', // 'ativa', 'reservada', 'concluida'
            ...oferta
        };

        this.dados.ofertas.unshift(novaOferta);
        // Limita o histórico salvo a 2000 ofertas para não crescer indefinidamente
        if (this.dados.ofertas.length > 2000) {
            this.dados.ofertas.pop();
        }

        this.salvar();
        return novaOferta;
    }

    obterOfertaPorId(id) {
        return this.dados.ofertas.find(o => o.id === id);
    }

    // ----------------------------------------------------
    // DEMANDAS (COMPRAS / PROCURAS)
    // ----------------------------------------------------
    adicionarDemanda(demanda) {
        if (!demanda) return null;
        const security = require('./security');
        if (security.ehNumeroBloqueado(demanda.autorTelefone, demanda.texto)) {
            console.log(`🚫 [DATABASE] Descartando demanda de contato bloqueado: ${demanda.autorTelefone}`);
            return null;
        }

        const existe = this.dados.demandas.find(d => d.msgId && d.msgId === demanda.msgId);
        if (existe) return existe;

        const novaDemanda = {
            id: 'DM-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase(),
            dataCriacao: new Date().toISOString(),
            status: 'ativa',
            ...demanda
        };

        this.dados.demandas.unshift(novaDemanda);
        if (this.dados.demandas.length > 2000) {
            this.dados.demandas.pop();
        }

        this.salvar();
        return novaDemanda;
    }

    obterDemandaPorId(id) {
        return this.dados.demandas.find(d => d.id === id);
    }

    // ----------------------------------------------------
    // BUSCA DE MATCHES (CRUZAMENTO DE OFERTAS & DEMANDAS)
    // ----------------------------------------------------
    buscarOfertasParaPerfume(perfumeTermo, maxDias = 15) {
        if (!perfumeTermo || perfumeTermo.length < 3) return [];
        const termoNorm = perfumeTermo.toLowerCase().trim();
        const limiteTempo = Date.now() - (maxDias * 24 * 60 * 60 * 1000);

        return this.dados.ofertas.filter(o => {
            if (o.status !== 'ativa') return false;
            const dataO = new Date(o.dataCriacao).getTime();
            if (dataO < limiteTempo) return false;

            const perfumeO = (o.perfume || '').toLowerCase();
            const textoO = (o.texto || '').toLowerCase();

            return perfumeO.includes(termoNorm) || termoNorm.includes(perfumeO) || textoO.includes(termoNorm);
        });
    }

    buscarDemandasParaPerfume(perfumeTermo, maxDias = 15) {
        if (!perfumeTermo || perfumeTermo.length < 3) return [];
        const termoNorm = perfumeTermo.toLowerCase().trim();
        const limiteTempo = Date.now() - (maxDias * 24 * 60 * 60 * 1000);

        return this.dados.demandas.filter(d => {
            if (d.status !== 'ativa') return false;
            const dataD = new Date(d.dataCriacao).getTime();
            if (dataD < limiteTempo) return false;

            const perfumeD = (d.perfume || '').toLowerCase();
            const textoD = (d.texto || '').toLowerCase();

            return perfumeD.includes(termoNorm) || termoNorm.includes(perfumeD) || textoD.includes(termoNorm);
        });
    }

    // ----------------------------------------------------
    // REGISTRO DE MATCHES
    // ----------------------------------------------------
    jaNotificouMatch(ofertaId, demandaId) {
        const chave = `${ofertaId}_${demandaId}`;
        return this.dados.matchesNotificados.includes(chave);
    }

    registrarMatchNotificado(ofertaId, demandaId) {
        const chave = `${ofertaId}_${demandaId}`;
        if (!this.dados.matchesNotificados.includes(chave)) {
            this.dados.matchesNotificados.push(chave);
            if (this.dados.matchesNotificados.length > 5000) {
                this.dados.matchesNotificados.shift();
            }
            this.salvar();
        }
    }

    // ----------------------------------------------------
    // CONFIGURAÇÃO PERSISTENTE (ADMIN CHAT ID)
    // ----------------------------------------------------
    definirAdminChatId(chatId) {
        if (!this.dados.config) this.dados.config = {};
        this.dados.config.adminChatId = String(chatId);
        this.salvar();
        return this.dados.config.adminChatId;
    }

    obterAdminChatId() {
        return this.dados?.config?.adminChatId || null;
    }
}

module.exports = new Database();
