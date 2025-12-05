# Roteirizador Diário Inteligente 🚛📍

Este é um sistema de otimização de rotas logísticas focado em visitas diárias (vendas, entregas, assistência técnica), construído com **React**, **TypeScript** e alimentado pela inteligência artificial do **Google Gemini**.

O diferencial deste projeto não é apenas calcular a menor distância, mas entender o **contexto urbano**, avaliando riscos de segurança, fiscalização e janelas de tempo, além de fornecer **inteligência de negócios** através de aprendizado de máquina.

---

## ⚙️ Engenharia e Algoritmos

O núcleo do sistema utiliza uma abordagem híbrida de Engenharia de Software Tradicional e AI Generativa para resolver problemas logísticos complexos.

### 1. Smart Retry with Fallback (Resiliência)
Para garantir alta disponibilidade mesmo sob carga ou instabilidade da API do Gemini, implementamos um padrão de **Retentativa Inteligente com Degradação Graciosa**:
1.  **Tentativa Otimista:** O sistema tenta gerar a rota completa utilizando todas as ferramentas (`Google Maps` para distâncias + `Google Search` para previsão do tempo e riscos).
2.  **Detecção de Erro:** Caso a API retorne erro 500 (Internal Error) ou Timeout devido à complexidade do contexto.
3.  **Backoff Exponencial:** O sistema aguarda um tempo progressivo (2s, 4s...) antes de tentar novamente.
4.  **Fallback (Degradação):** Nas tentativas subsequentes, o sistema **remove ferramentas não essenciais** (como o Google Search). Isso reduz drasticamente a carga computacional, garantindo que o usuário receba a rota (o produto principal), mesmo que sem os metadados de clima.

### 2. CVRPTW via Prompt Engineering
O sistema simula um solver de **CVRPTW (Capacitated Vehicle Routing Problem with Time Windows)**, um problema clássico de pesquisa operacional geralmente resolvido pelo *Google OR-Tools*.
*   Ao invés de codificar as restrições matematicamente, instruímos o LLM a atuar como um solver logístico.
*   **Restrições Rígidas (Hard Constraints):** Janelas de tempo (Abertura/Fechamento), Capacidade do Veículo (Máx. visitas) e Dias de Folga.
*   **Restrições Suaves (Soft Constraints):** Preferência de almoço e minimização de custos de estacionamento.

### 3. Heurística A* (A-Star) e Nearest Neighbor
Instruímos o modelo a utilizar conceitos do algoritmo **A* (A-Star)** para determinação de caminho entre nós e a heurística **Nearest Neighbor** para sequenciamento:
*   O sistema penaliza "saltos" longos entre bairros distantes.
*   Utiliza lógica "Cluster-First" (Agrupar primeiro) para criar densidade geográfica antes de traçar a rota fina, imitando o comportamento de algoritmos de otimização de grafos.

---

## 🧠 Lógica de Negócio e Priorização

O sistema não é passivo; ele toma decisões de prioridade baseadas na saúde dos ativos (IoT) e regras de negócio.

### Prioridade Híbrida (Hybrid Priority Logic)
A definição de quem visitar primeiro segue uma lógica de "Waterfalls":
1.  **Prioridade Explícita:** Se a planilha importada contém uma coluna "Prioridade" (Alta, Média, Baixa), esta prevalece sobre tudo.
2.  **Prioridade Automática (Data-Driven):** Se nenhuma prioridade é informada, o sistema analisa os dados de telemetria das máquinas (POS):
    *   **CRÍTICO (Alta Prioridade):** Taxa de erro > 6% ou Bateria < 15%. O sistema entende que há risco iminente de *churn* (cancelamento).
    *   **ATENÇÃO (Média Prioridade):** Bobina de papel acabando ou Sinal Wifi instável.
    *   **NORMAL:** Equipamentos operando dentro dos parâmetros.

### Capacidade Operacional Líquida
O indicador de "Capacidade Restante" no dashboard não é apenas uma subtração simples. Ele considera:
*   **Fator Humano:** Apenas colaboradores marcados como "Ativos" e que **não estão de férias** entram no cálculo.
*   **Carga Variável:** `Capacidade Total = Σ (Colaboradores Ativos * Configuração Individual de Máx Visitas)`.
*   **Health Score:** O percentual exibido (`% da Demanda`) indica se a equipe atual consegue absorver o volume de visitas importado sem gerar horas extras excessivas.

---

## 👥 Gestão de Colaboradores e Impacto na Rota

O cadastro do colaborador influencia diretamente o custo e a geometria da rota gerada:

1.  **Modo de Transporte:**
    *   *Carro/Moto:* O algoritmo considera trânsito de vias rápidas e alerta sobre estacionamento.
    *   *A pé/Transporte Público:* O algoritmo prioriza rotas com menor distância linear e ignora sentidos de via (mão única), focando em clusters de alta densidade (vários clientes na mesma rua).
2.  **Pontos de Ancoragem (Depots):**
    *   **Start Location:** Define o nó inicial do grafo. Se o colaborador sai de casa direto para o cliente, a rota é otimizada para essa vizinhança, economizando o deslocamento até a sede.
    *   **End Location:** Define se o colaborador deve retornar à base (fechamento de caixa/estoque) ou se está liberado no último cliente.
3.  **Carteira (Portfolio):**
    *   O sistema realiza um "Fuzzy Match" (comparação aproximada de texto) entre a lista de clientes importada e a carteira do colaborador. Se houver match, a IA é instruída a forçar a atribuição para aquele membro, respeitando o relacionamento comercial existente.

---

## 📊 Inteligência de Dados (Machine Learning)

### Segmentação Automática (K-Means Clustering)
Implementamos o algoritmo **K-Means** (Unsupervised Learning) para descobrir padrões ocultos na base de clientes sem necessidade de categorização manual prévia.
*   **Vetores de Análise:** Faturamento Médio, Horário de Abertura, Horário de Fechamento e Duração da Operação.
*   **Perfis Dinâmicos:** Identifica perfis como "Alto Desempenho", "Manhã Premium" e "Operação Estendida".

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