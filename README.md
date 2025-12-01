# Roteirizador Diário Inteligente 🚛📍

Este é um sistema de otimização de rotas logísticas focado em visitas diárias (vendas, entregas, assistência técnica), construído com **React**, **TypeScript** e alimentado pela inteligência artificial do **Google Gemini**.

O diferencial deste projeto não é apenas calcular a menor distância, mas entender o **contexto urbano**, avaliando riscos de segurança, fiscalização e janelas de tempo, algo que algoritmos matemáticos puros muitas vezes ignoram.

---

## 🧠 A Estratégia Algorítmica (Gemini VRP)

Ao contrário de roteirizadores tradicionais que usam apenas geometria, este sistema utiliza o Google Gemini 2.5 Flash simulando um **VRP Solver (Vehicle Routing Problem)** através de uma engenharia de prompt avançada.

A instrução enviada à IA segue a metodologia **"Cluster-First, Route-Second"**, combinada com heurísticas de refinamento. Abaixo, detalhamos a lógica instruída ao modelo:

### 1. Cluster-First (Agrupamento Geográfico)
O algoritmo divide os pontos de parada em "clusters" (agrupamentos) baseados em zonas ou bairros.
*   **Objetivo:** Evitar deslocamentos pendulares (ziguezagues) cruzando a cidade desnecessariamente.
*   **Regra:** O roteiro deve esgotar todas as visitas de uma região (ex: Zona Norte) antes de iniciar o deslocamento para a próxima (ex: Centro).

### 2. Nearest Neighbor & Cheapest Insertion
Dentro de cada cluster, a sequência é definida por heurísticas gulosas:
*   **Nearest Neighbor (Vizinho Mais Próximo):** A partir do ponto atual, qual é o próximo ponto mais próximo que ainda não foi visitado?
*   **Cheapest Insertion:** Onde inserir uma nova parada na rota existente de forma que o aumento do custo (tempo/distância) seja o menor possível?

### 3. Refinamento 2-Opt
Após gerar uma rota inicial, o modelo é instruído a aplicar mentalmente a lógica **2-Opt** para remover cruzamentos de rota.
*   *Cenário:* Se a rota faz A -> B -> C -> D, mas o caminho se cruza, o modelo avalia se A -> C -> B -> D é mais eficiente.

### 4. Análise de Risco e Restrições (Contexto Semântico)
Aqui entra a vantagem da LLM sobre a matemática pura. O modelo avalia cada endereço considerando:
*   **Segurança (Crime Risk):** Evita agendar áreas perigosas para o final do dia/noite.
*   **Mobilidade (Flood/Towing):** Identifica áreas de alagamento ou zonas de guincho agressivas.
*   **Hard Constraints:** Janelas de horário de funcionamento (Abre/Fecha) e Horário de Almoço.

---

## 🛠️ Stack Tecnológico

*   **Frontend:** React 19, TypeScript, Tailwind CSS.
*   **AI & Logic:** Google GenAI SDK (`@google/genai`), Modelo `gemini-2.5-flash`.
*   **Dados:** `xlsx` (SheetJS) para leitura de planilhas Excel/CSV.
*   **Mapas:** Google Maps Grounding (via Gemini Tools) para validação de coordenadas.

## 🚀 Como Usar

1.  **Upload:** Carregue um arquivo `.xlsx` ou `.csv` contendo as colunas: `Nome`, `Endereço`, `Obs`, `HorárioAbertura`, `HorárioFechamento`.
2.  **Configuração:** Defina horário de saída/retorno, duração média das visitas, pausa para almoço e se deve passar no escritório.
3.  **Processamento:** Acompanhe o progresso enquanto a IA:
    *   Lê e interpreta os endereços.
    *   Analisa riscos de segurança dos bairros.
    *   Aplica a clusterização e ordenação.
4.  **Resultado:** Visualize o itinerário detalhado, avisos de risco e links diretos para o Google Maps.

## 📋 Formato da Planilha

Para melhores resultados, sua planilha deve conter:

| Nome           | Endereço                          | Obs              | HorarioAbertura |
| :---           | :---                              | :---             | :---            |
| Cliente A      | Av. Paulista, 1000 - SP           | Entregar na doca | 08:00           |
| Cliente B      | Rua Augusta, 500 - SP             | Falar com João   | 09:00           |

---

**Desenvolvido como demonstração de Roteirização Inteligente Contextual.**
