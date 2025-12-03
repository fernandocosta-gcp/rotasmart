# Roteirizador Diário Inteligente 🚛📍

Este é um sistema de otimização de rotas logísticas focado em visitas diárias (vendas, entregas, assistência técnica), construído com **React**, **TypeScript** e alimentado pela inteligência artificial do **Google Gemini**.

O diferencial deste projeto não é apenas calcular a menor distância, mas entender o **contexto urbano**, avaliando riscos de segurança, fiscalização e janelas de tempo, além de fornecer **inteligência de negócios** através de aprendizado de máquina.

---

## 🧠 A Estratégia Algorítmica (Gemini VRP)

Ao contrário de roteirizadores tradicionais que usam apenas geometria, este sistema utiliza o Google Gemini 2.5 Flash simulando um **VRP Solver (Vehicle Routing Problem)** através de uma engenharia de prompt avançada.

A instrução enviada à IA segue a metodologia **"Cluster-First, Route-Second"**, combinada com heurísticas de refinamento:

1.  **Cluster-First:** Agrupa visitas por bairros/zonas para evitar deslocamentos pendulares.
2.  **Time-Windows:** Respeita rigorosamente horários de abertura/fechamento e pausas de almoço.
3.  **Análise de Risco:** Avalia semanticamente o endereço para alertar sobre áreas de alagamento, risco de segurança ou zonas de guincho.

---

## 👥 Gestão de Equipes e Território (Novo!)

O sistema conta com um módulo completo de **Gestão de Recursos Humanos e Territoriais**, permitindo o cadastro de times e a visualização estratégica da cobertura operacional.

### 1. Cadastro de Equipes e Colaboradores
Organize sua força de trabalho com detalhes logísticos precisos:
*   **Parâmetros de Equipe:** Definição de "Máximo de Atividades por Roteiro" e Regiões de Atuação (Bairro/Cidade).
*   **Perfil do Colaborador:**
    *   **Jornada:** Escala de trabalho semanal (dias úteis, folgas) e horários de entrada/saída.
    *   **Transporte:** Indicação se utiliza carro próprio ou transporte público, incluindo dia de rodízio municipal.
    *   **Logística Pessoal:** Definição de endereços de partida e retorno customizados (casa do colaborador vs. sede da empresa).

### 2. Mapa de Calor de Cobertura (Heatmap Analytics)
Uma ferramenta visual estratégica para gerentes de operações:
*   **Geocodificação via IA:** Utiliza o Gemini (Google Maps Grounding) para converter listas de "Bairro - Cidade" em coordenadas geográficas em lote.
*   **Visualização de Densidade:** Um mapa térmico interativo (Leaflet) plota a intensidade de cobertura baseada no número de colaboradores alocados em cada região.
*   **Tomada de Decisão:** Permite identificar visualmente "zonas frias" (áreas descobertas) ou "zonas quentes" (sobreposição de equipes) para rebalanceamento territorial.

---

## 📊 Inteligência de Dados e Machine Learning

O sistema vai além do roteamento, atuando como um **Analista de Negócios** via Aprendizado de Máquina Não-Supervisionado executado diretamente no navegador.

### Segmentação Automática (K-Means Clustering)
Implementamos o algoritmo **K-Means** (Unsupervised Learning) para descobrir padrões ocultos na base de clientes sem necessidade de categorização manual prévia.

*   **Vetores de Análise:** O algoritmo cruza *Faturamento Médio*, *Horário de Abertura*, *Horário de Fechamento* e *Duração da Operação*.
*   **Perfis Dinâmicos:** O sistema agrupa e rotula automaticamente os estabelecimentos em perfis estratégicos:
    *   **💰 Alto Desempenho:** Líderes de receita em horário comercial.
    *   **☕ Manhã Premium:** Lojas com alto fluxo matinal.
    *   **🏪 Operação Estendida:** Estabelecimentos com longas jornadas (madrugada/noite).
    *   **📉 Baixo Desempenho:** Oportunidades de crescimento ou risco de churn.

---

## 🛠️ Funcionalidades para Field Service (FSR)

Focado na eficiência do técnico de campo (Field Service Representative), o sistema oferece ferramentas de diagnóstico e logística fina.

### 1. Monitoramento de Saúde POS (IoT Digital Twin)
Um dashboard completo para monitoramento preventivo do parque de máquinas de cartão (POS).
*   **Métricas em Tempo Real:** Monitora Nível de Bateria, Sinal Wifi/4G, Taxa de Erros e Status da Bobina (Papel).
*   **Índice de Operacionalidade:** Um gráfico de "medidor" (Gauge Chart) resume a saúde geral do cliente ou da rota.
*   **Manutenção Preditiva:** O sistema alerta sobre máquinas críticas antes da visita.

### 2. Validação de Transporte Público (Bus Stop Grounding)
Integração profunda com **Google Maps** via Gemini Tools para enriquecimento de endereço e mobilidade urbana.
*   **Varredura de Raio:** O sistema analisa um raio de 300 metros das coordenadas do cliente.
*   **Substituição Inteligente:** Se um ponto de ônibus é identificado, o sistema pode substituir o endereço logístico pela referência do ponto.

---

## 🚀 Stack Tecnológico

*   **Frontend:** React 19, TypeScript, Tailwind CSS.
*   **AI & Logic:** Google GenAI SDK (`@google/genai`), Modelo `gemini-2.5-flash`.
*   **Mapas & Visualização:** Leaflet (Mapas), Leaflet.heat (Heatmap), Google Maps Grounding.
*   **Dados:** `xlsx` (SheetJS) para leitura de planilhas Excel/CSV.

## 📋 Como Usar

1.  **Equipes:** Cadastre suas equipes e regiões no menu superior direito. Visualize o Mapa de Calor para garantir cobertura.
2.  **Upload:** Carregue um arquivo `.xlsx` ou `.csv` com a lista de clientes.
3.  **Análise:** Utilize o **Módulo de Análise** para ver a segmentação automática por IA.
4.  **Configuração:** Defina parâmetros de rota (início, fim, almoço).
5.  **Resultado:** Receba um itinerário otimizado com previsão do tempo, riscos e saúde dos equipamentos.

---

**Desenvolvido como demonstração de Roteirização Inteligente Contextual.**