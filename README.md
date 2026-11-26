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

### Correção em lote

    node grader.js <diretorio-de-envios> <tabela.csv|tsv> [--out notas.csv] [--max 10]

Cada arquivo do diretório (qualquer extensão; arquivos ocultos são ignorados) é avaliado contra a tabela. O nome do
aluno é o nome do arquivo sem a última extensão. Gera um CSV `aluno,nota,comentario` (na saída padrão ou em `--out`):
nota = `--max` (padrão 10) se correto, 0 caso contrário. O comentário traz Correto/Incorreto (com o motivo), o aviso
quando há mais de um circuito no arquivo e erros de leitura (ex.: arquivo que não é um circuito JSON).

O motor de simulação fica em `engine.js`, compartilhado por `index.html` e pelo corretor.
