import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	ANSWERABLE,
	apiBaseUrl,
	beaconUrlFor,
	getForm,
	getList,
	liveQuestions,
	loadForms,
	questionId,
	simplifyResponse,
} from './GenericFunctions';

// Programmatic style: listing responses needs the form too (answers are keyed
// by question title), and submitting is a chain of beacon hits in one session,
// which routing cannot describe.

const formIdField = {
	displayName: 'Form Name or ID',
	name: 'formId',
	type: 'options' as const,
	typeOptions: { loadOptionsMethod: 'getForms' },
	required: true,
	default: '',
	description:
		'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
};

export class FoxForm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FoxForm',
		name: 'foxForm',
		icon: { light: 'file:../../icons/foxform.svg', dark: 'file:../../icons/foxform.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read forms and responses and submit responses in FoxForm',
		defaults: { name: 'FoxForm' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'foxFormApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Form', value: 'form' },
					{ name: 'Response', value: 'response' },
				],
				default: 'response',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['form'] } },
				options: [
					{ name: 'Get', value: 'get', description: 'Get a form', action: 'Get a form' },
					{ name: 'Get Many', value: 'getAll', description: 'Get many forms', action: 'Get many forms' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['response'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get many responses of a form, newest first',
						action: 'Get many responses',
					},
					{
						name: 'Submit',
						value: 'submit',
						description: 'Submit a response to a published form, as if someone had filled it in',
						action: 'Submit a response',
					},
				],
				default: 'getAll',
			},
			{
				...formIdField,
				displayOptions: { show: { resource: ['form'], operation: ['get'] } },
			},
			{
				...formIdField,
				displayOptions: { show: { resource: ['response'] } },
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: { show: { operation: ['getAll'] } },
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: { show: { operation: ['getAll'], returnAll: [false] } },
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of results to return',
			},
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				displayOptions: { show: { resource: ['response'], operation: ['getAll'] } },
				default: true,
				description:
					'Whether to return answers keyed by question title instead of the raw response',
			},
			{
				displayName: 'Answers',
				name: 'answers',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Answer',
				displayOptions: { show: { resource: ['response'], operation: ['submit'] } },
				default: {},
				description:
					'The form must be published. The response shows up in FoxForm a few minutes later, with the form webhooks and emails.',
				options: [
					{
						displayName: 'Answer',
						name: 'answer',
						values: [
							{
								displayName: 'Question Name or ID',
								name: 'questionId',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getQuestions',
									loadOptionsDependsOn: ['formId'],
								},
								default: '',
								description:
									'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description:
									'For checkboxes, separate the options with commas. Numbers for rating, NPS, scale and slider.',
							},
						],
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			getForms: loadForms,
			async getQuestions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const formId = this.getCurrentNodeParameter('formId') as string;
				if (!formId) return [];
				const form = await getForm.call(this, formId);
				return liveQuestions(form)
					.filter((q) => q.type && ANSWERABLE.has(q.type) && questionId(q))
					.map((q) => ({
						name: `${q.title || questionId(q)}${q.required ? ' (required)' : ''}`,
						value: questionId(q) as string,
					}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let result: IDataObject | IDataObject[];

				if (resource === 'form' && operation === 'get') {
					result = (await getForm.call(this, this.getNodeParameter('formId', i) as string)) as unknown as IDataObject;
				} else if (resource === 'form' && operation === 'getAll') {
					const limit = this.getNodeParameter('returnAll', i)
						? Infinity
						: (this.getNodeParameter('limit', i) as number);
					result = await getList.call(this, '/forms', limit);
				} else if (resource === 'response' && operation === 'getAll') {
					const formId = this.getNodeParameter('formId', i) as string;
					const limit = this.getNodeParameter('returnAll', i)
						? Infinity
						: (this.getNodeParameter('limit', i) as number);
					const [form, responses] = await Promise.all([
						getForm.call(this, formId),
						getList.call(this, `/forms/${encodeURIComponent(formId)}/responses`, limit),
					]);
					result = this.getNodeParameter('simplify', i)
						? responses.map((r) => simplifyResponse(form, r))
						: responses;
				} else if (resource === 'response' && operation === 'submit') {
					result = await submitResponse.call(this, i);
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${resource}.${operation}`, {
						itemIndex: i,
					});
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(result),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

// A v4-shaped id for the beacon session, as the form player makes. Not a
// secret: it only groups the hits of one response.
function sessionId(): string {
	const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
	hex[12] = '4';
	hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
	const h = hex.join('');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// The beacon pixel the form player itself sends (foxform-frontend lib/beacon.ts):
// a GET per answer, between __start__ and __complete__, all with the same
// session. The beacon worker turns the session into a response (and fires the
// form's webhooks and emails) a few minutes later, the same as a real visitor.
// Same flow as the Zapier "Submit Response" action.
async function submitResponse(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const formId = this.getNodeParameter('formId', i) as string;
	// Authenticated read first: the form must be the account's own and live.
	const form = await getForm.call(this, formId);
	if (!form || form.status !== 'published') {
		throw new NodeOperationError(this.getNode(), 'Form not found or not published', { itemIndex: i });
	}
	const questions = new Map(liveQuestions(form).map((q) => [questionId(q), q]));
	const rows = (this.getNodeParameter('answers.answer', i, []) as IDataObject[]) || [];
	const answers: Record<string, unknown> = {};
	for (const row of rows) {
		const qid = row.questionId as string;
		const raw = row.value;
		if (!qid || raw === undefined || raw === null || raw === '') continue;
		const q = questions.get(qid);
		if (!q) {
			throw new NodeOperationError(this.getNode(), `Question ${qid} is not in the published form`, {
				itemIndex: i,
			});
		}
		answers[qid] = q.type === 'checkboxes' && typeof raw === 'string'
			? raw.split(',').map((s) => s.trim()).filter(Boolean)
			: raw;
	}
	const missing = liveQuestions(form)
		.filter((q) => q.required && q.type && ANSWERABLE.has(q.type) && answers[questionId(q) as string] === undefined)
		.map((q) => q.title || questionId(q));
	if (missing.length) {
		throw new NodeOperationError(this.getNode(), `Missing required answers: ${missing.join('; ')}`, {
			itemIndex: i,
		});
	}

	const beacon = beaconUrlFor(await apiBaseUrl.call(this));
	const sid = sessionId();
	const t0 = Date.now();
	const events: Array<[string, unknown]> = [['__start__', 'started'], ...Object.entries(answers), ['__complete__', 'completed']];
	for (let n = 0; n < events.length; n++) {
		const [qid, answer] = events[n];
		const ans = typeof answer === 'object' && answer !== null ? JSON.stringify(answer) : String(answer);
		await this.helpers.httpRequest({
			method: 'GET',
			url: beacon,
			qs: { fid: formId, qid, ans: encodeURIComponent(ans), sid, t: String(t0 + n) },
		});
	}
	return { id: sid, form_id: formId, submitted_at: new Date(t0).toISOString() };
}
