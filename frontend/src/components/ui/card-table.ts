// Tabela que vira lista de cards abaixo de `md`, só com CSS (F-08). Uma
// marcação só: sem duplicar linhas, campos e botões para o celular (o que
// também duplicaria a navegação por setas das Notas). Cada tela define o grid
// da linha (`<tr>`) e onde cada célula cai no card.
export const cardTable = {
  table: "block md:table",
  header: "hidden md:table-header-group",
  body: "block md:table-row-group",
  cell: "p-0 md:p-4",
  // Rótulo só no card; no desktop quem rotula é o cabeçalho da tabela.
  label:
    "before:mb-1 before:block before:text-[10px] before:font-medium before:uppercase before:tracking-wide before:text-muted-foreground before:content-[attr(data-label)] md:before:content-none",
};
