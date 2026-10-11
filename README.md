# Brave Barber

Agendamento, pedidos, balcão e administração da barbearia.

- **apps/web**: Next.js 15, TypeScript, shadcn/ui (Radix) com os tokens do design system e GSAP para animações.
- **apps/api**: NestJS 11 em monólito modular (DDD + Clean Architecture) com Prisma: SQLite no desenvolvimento e PostgreSQL/Supabase em produção.

## Rodar em desenvolvimento

```bash
npm install
cp apps/api/.env.example apps/api/.env   # já vem pronto para SQLite
npm run db:setup                          # cria o banco e roda o seed
npm run dev                               # API em :3333 e site em :3000
```

Sem `GOOGLE_CLIENT_ID`, a tela de login oferece "Entrar como" com os usuários do seed:

| Papel | E-mail |
|---|---|
| Administrador | admin@bravebarber.com.br |
| Barbeiro + admin | breno@bravebarber.com.br |
| Balconista | patricia@bravebarber.com.br |
| Cliente | lucas.reis@gmail.com |

A agenda de hoje do seed é montada a partir da hora em que ele roda. Rode `npm run db:reset` para recriar os dados quando quiser testar o dia de novo.

Sem `STRIPE_SECRET_KEY`, os pagamentos usam um gateway simulado. O Pix é aprovado em "Já paguei, verificar". Qualquer cartão válido é aprovado, menos o 4000 0000 0000 0002, que é recusado.

## Trocar para Supabase (produção)

Em `apps/api/.env`, defina `DATABASE_PROVIDER=postgresql`, `DATABASE_URL` (pooler, porta 6543) e `DIRECT_URL` (porta 5432). Depois rode:

```bash
npm run db:migrate -w apps/api   # cria prisma/postgresql/migrations
npm run db:deploy  -w apps/api   # aplica no servidor
```

O schema-fonte é `apps/api/prisma/schema.base.prisma`. O script `scripts/prisma-schema.mjs` gera o schema de cada provedor, e cada um mantém a própria pasta de migrações. As fotos vão para o Supabase Storage com `STORAGE_DRIVER=supabase`.

## Arquitetura da API

Cada contexto em `apps/api/src/modules/<contexto>` tem as camadas `domain` (agregados e regras), `application` (casos de uso e consultas), `infrastructure` (Prisma e gateways) e `presentation` (controllers). Os contextos são:

- `ordering`: pedido, pagamentos, balcão e atendimento.
- `catalog`: serviços, produtos, ofertas e preços.
- `scheduling`: agenda e horários livres.
- `commissions`: comissões e ganhos.
- `identity`: login, perfil e papéis.
- `reviews`: avaliações.
- `engagement`: favoritos, avisos e e-mail.
- `business`: configurações e políticas.
- `storefront`: vitrine pública.
- `reporting`: relatórios.

Os módulos conversam por serviços exportados e por eventos de domínio.

Os testes de domínio ficam em `npm test`.
