Brave Barber é uma barbearia em Gaibu, Cabo de Santo Agostinho – PE, desde 2019. A identidade é **metal cromado sobre preto**: monocromática, sem nenhuma cor de matiz, com brilho de aço escovado, caixa alta firme e um toque manuscrito. Assinatura: **Estilo • Respeito • Confiança**.

## Conteúdo e voz

- Fale direto com o cliente, em segunda pessoa e no imperativo: "Aproveite e agende seu horário!", "Agende seu horário e garanta seu atendimento."
- Informação primeiro: status (`BARBEARIA ABERTA`), horário (`HOJE ATÉ ÀS 20H!`), serviços, endereço, @.
- Títulos, horários, CTAs e endereço em **caixa alta**. Horário sempre no formato `21H` (número + H maiúsculo, sem minutos quando forem redondos).
- O manuscrito (`post-script` / `script-accent`) só conecta ou assina: "até às", "Sua melhor versão, sempre." Nunca coloque preço, horário ou endereço em script.
- Endereço padrão: `AV. LAURA CAVALCANTE – GAIBU, CABO DE SANTO AGOSTINHO – PE` (travessão meia-risca entre partes). Instagram: `@bravebarber`.
- Separe valores com ponto médio espaçado: `ESTILO • RESPEITO • CONFIANÇA`. Marque o ano com traços: `— DESDE 2019 —`.
- Sem emoji nas peças.

## Cor

- A paleta é só preto, grafite, aço e prata. Não introduza cores de matiz (nem dourado, nem vermelho de barber pole) — o poste de barbeiro aparece em preto e prata.
- **Tema Noite** (padrão): `surface` preto, texto em `ink`; foto da barbearia escurecida ao fundo à direita, com o texto à esquerda.
- **Tema Prata**: `surface` cinza-prata escovado, títulos em `ink` preto, bloco do horário em `panel` preto com `on-panel` e `shadow-lift`.
- **Degradê cromado** (classe `.bb-chrome` no bundle): `chrome-highlight` → `chrome-light` → `chrome-mid` → `chrome-light` → `chrome-shadow`, vertical. Use em no máximo duas palavras por peça (o hero "ABERTA" e o número do horário). Nunca em texto pequeno (< 40 px).
- Informação secundária em `ink-muted`; divisores em `line`; contornos que precisam ser vistos em `line-strong`.
- Foco de teclado na web: anel sólido de 2px em `focus-ring` com 2px de afastamento.

## Tipografia

- `sans` (Montserrat, 500–800) faz quase tudo: hero, kicker, horário, CTA, informações.
- `condensed` (Oswald 700) é a alternativa de impacto para o hero em peças claras (`post-hero-condensed`).
- `script` (Mr Dafoe) é o traço manuscrito, uma vez por peça.
- Hierarquia do story: `post-kicker` (BARBEARIA) → `post-hero` (ABERTA) → `post-script` (até às) → HoursBadge com `post-numeral` → `post-cta` → ServiceStrip → ContactInfo em `post-info` → `post-tagline`.
- As fontes são aproximações livres (Google Fonts) das letras vistas nos posts; o wordmark "BRAVE BARBER" da logo é desenho próprio e só aparece como imagem.

## Layout e forma

- Story 1080×1920: margem lateral de 96 px (`space-12` × 2), texto alinhado à esquerda, logo centralizada no topo, assinatura da logo logo abaixo dela.
- Blocos empilhados com `space-8` entre si; dentro do bloco, `space-2`/`space-3`.
- Cantos: `radius-md` nas caixas de horário; `radius-pill` nos chips de ícone; nada mais é arredondado.
- Sombra só no bloco preto sobre fundo claro (`shadow-lift`). No tema Noite, profundidade vem da foto escura e do brilho cromado, não de sombra.
- Imagens: fotos da própria barbearia (cadeiras pretas, espelhos com luz de LED branca, monograma BB na parede) em preto e branco, escurecidas. Poste de barbeiro cromado como elemento de canto.

## Logo

- `assets/Logos/brave-barber-logo-cromado.png`: monograma BB espelhado em metal cromado + wordmark, fundo transparente. Use sobre `surface` de qualquer tema com área livre de pelo menos a altura da barra "///" do monograma.
- `assets/Logos/brave-barber-avatar.png`: versão circular sobre textura preta, para avatar de redes sociais.
- Não recolorir, não aplicar contorno, não redesenhar o monograma, não separar o wordmark do símbolo.

## Iconografia

- Ícones lineares, traço fino (1.5 em grade de 24 px), pontas arredondadas, monocromáticos. Conjunto em `assets/Icones/` e em `BraveBarber.icon(nome)` (desenhado com `currentColor`).
- Ícones dentro de chips redondos `panel` (story claro) ou soltos ao lado do texto (story escuro).
- Os SVGs são redesenhados a partir das capturas — substituem os ícones originais das artes até que os arquivos-fonte sejam fornecidos.
