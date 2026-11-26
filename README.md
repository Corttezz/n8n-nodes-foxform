# n8n-nodes-foxform

n8n community nodes for [FoxForm](https://foxform.app): forms, quizzes and funnels with AI.

## Nodes

**FoxForm Trigger** (polling): starts the workflow when someone submits the chosen form. The first poll only records the responses that already exist; after that each new response fires once. "Fetch test event" returns the latest response.

**FoxForm**
- Form › Get, Get Many
- Response › Get Many (newest first; with Simplify on, answers come keyed by question title)
- Response › Submit: sends a response to a published form, as if someone had filled it in. It goes through the same beacon the form player uses, so the response shows up a few minutes later, with the form's webhooks and emails. Required questions must be answered; for checkboxes, separate the options with commas.

## Credentials

In FoxForm, open **MCP & API** and create an API key (it starts with `ff_live_`). In n8n, create a **FoxForm API** credential and paste it. Leave **API URL** as `https://api.foxform.app`.

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) and install `n8n-nodes-foxform`.

## Development

`npm install`, then `npm run build` and `npm run lint` (the `n8n-node` CLI). `npm run dev` starts a local n8n with the nodes loaded.

To try it against staging, set the credential's API URL to `https://api-staging.foxform.app`: Submit then uses `https://beacon-staging.foxform.app/b.gif`.

This folder lives in the FoxForm backend repository with the Zapier and Make apps. n8n only verifies packages published to npm from GitHub Actions with provenance (`.github/workflows/publish.yml`), so publishing needs this folder in a GitHub repository with npm Trusted Publishing set up.

## Compatibility

Built with `@n8n/node-cli` 0.58 (n8nNodesApiVersion 1).
