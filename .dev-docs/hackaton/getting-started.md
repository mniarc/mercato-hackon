Getting started
In this track you don't use npx create-mercato-app. You work on the Open Mercato monorepo, from the develop branch - that's where the Agent Orchestrator lives.

What you need: Node.js 24, Git, and PostgreSQL + Redis (easiest via Docker Desktop).

Setup (macOS / Linux):

Enable yarn: corepack enable && corepack prepare yarn@4.12.0 --activate
Clone the repository: git clone https://github.com/open-mercato/open-mercato.git
Switch to the develop branch: cd open-mercato && git checkout develop
Start the services (PostgreSQL, Redis, Meilisearch): docker compose up -d
Copy the environment file: cp apps/mercato/.env.example apps/mercato/.env
Set DATABASE_URL, JWT_SECRET, and REDIS_URL in it
Install, build, seed, and start the app: yarn dev:greenfield
Open http://localhost:3000/backend - credentials are printed in the terminal
On Windows the steps are analogous (PowerShell as Administrator). Full per-platform instructions: https://docs.openmercato.com/installation/monorepo