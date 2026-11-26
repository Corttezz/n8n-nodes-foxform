import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { foxFormApiRequest, getForm, loadForms, simplifyResponse } from '../FoxForm/GenericFunctions';

// Keeps the ids already seen so a response fires once. GET
// /forms/{id}/responses is newest first and every item has a stable id.
const SEEN_MAX = 500;
const PAGE = 50;

export class FoxFormTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FoxForm Trigger',
		name: 'foxFormTrigger',
		icon: { light: 'file:../../icons/foxform.svg', dark: 'file:../../icons/foxform.dark.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: 'New response',
		description: 'Starts the workflow when someone submits a FoxForm form',
		defaults: { name: 'FoxForm Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'foxFormApi', required: true }],
		properties: [
			{
				displayName: 'Form Name or ID',
				name: 'formId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getForms' },
				required: true,
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				default: true,
				description:
					'Whether to return answers keyed by question title instead of the raw response',
			},
		],
	};

	methods = { loadOptions: { getForms: loadForms } };

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const formId = this.getNodeParameter('formId') as string;
		const simplify = this.getNodeParameter('simplify') as boolean;
		const state = this.getWorkflowStaticData('node') as { formId?: string; seen?: string[] };
		const manual = this.getMode() === 'manual';

		const res = await foxFormApiRequest.call(this, 'GET', `/forms/${encodeURIComponent(formId)}/responses`, {
			page: 1,
			limit: PAGE,
		});
		const responses = (res.data as IDataObject[]) || [];

		// "Fetch test event": the latest response, without touching the state.
		if (manual) {
			if (!responses.length) return null;
			const form = await getForm.call(this, formId);
			const r = responses[0];
			return [this.helpers.returnJsonArray(simplify ? simplifyResponse(form, r) : r)];
		}

		// First poll (or another form chosen): record a baseline, fire nothing.
		if (!state.seen || state.formId !== formId) {
			state.formId = formId;
			state.seen = responses.map((r) => r.id as string).slice(0, SEEN_MAX);
			return null;
		}

		const seen = new Set(state.seen);
		const fresh = responses.filter((r) => !seen.has(r.id as string));
		if (!fresh.length) return null;
		state.seen = [...fresh.map((r) => r.id as string), ...state.seen].slice(0, SEEN_MAX);

		const form = simplify ? await getForm.call(this, formId) : null;
		// Oldest first, the order they came in.
		const out = fresh.reverse().map((r) => (form ? simplifyResponse(form, r) : r));
		return [this.helpers.returnJsonArray(out)];
	}
}
