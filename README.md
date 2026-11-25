# elecsim-ufrgs
Basic electric/electronic circuit simulator

## Corretor automático

    node grader.js <circuito.json> <tabela.csv|tsv> [--quiet]

Verifica se o circuito implementa a tabela verdade (cabeçalho + linhas 0/1; delimitador tab, `;` ou `,`).
Entradas = interruptores, saídas = lâmpadas. Colunas são associadas aos componentes pelo nome (sem diferenciar
maiúsculas); componentes sem nome são associados testando todas as ordens, então a ordem das variáveis é irrelevante.
Sem nomes nas lâmpadas, as últimas colunas são consideradas saídas.
Se o envio tiver mais de um circuito independente (baterias são compartilhadas), todos são avaliados, um aviso é
impresso e o envio é aceito se algum deles estiver correto.
Código de saída: 0 correto, 1 incorreto, 2 erro de entrada.

O motor de simulação fica em `engine.js`, compartilhado por `index.html` e pelo corretor.
