FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install

COPY apps ./apps
COPY packages ./packages

ENV NODE_ENV=development
EXPOSE 3000

CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm run dev:docker -w @cnpaf/web"]
