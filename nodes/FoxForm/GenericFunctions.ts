import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	IPollFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';

// The FoxForm public API, the same one the MCP server, Zapier and Make use.
// Mirrors integrations/zapier/lib/api.js.

type FoxFormContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

export interface FoxFormQuestion {
	id?: string;
	_id?: string;
	type?: string;
	title?: string;
	label?: string;
	required?: boolean;
	options?: unknown[];
}

export interface FoxFormForm {
	id: string;
	title?: string;
	status?: string;
	questions?: FoxFormQuestion[];
	published_snapshot?: { questions?: FoxFormQuestion[] };
}

// Screens that collect an answer. The rest (welcome, end, media, timer...)
// only show content, and file_upload needs the form itself.
export const ANSWERABLE = new Set([
	'short_text',
	'long_text',
	'email',
	'phone',
	'url',
	'number',
	'date',
	'dropdown',
	'multiple_choice',
	'checkboxes',
	'picture_choice',
	'yes_no',
	'rating',
	'opinion_scale',
	'nps',
	'slider',
]);

const PROD_API = 'https://api.foxform.app';

export async function apiBaseUrl(this: FoxFormContext): Promise<string> {
	const credentials = await this.getCredentials('foxFormApi');
	return String(credentials.baseUrl || PROD_API).replace(/\/+$/, '');
}

// api.foxform.app -> beacon.foxform.app, api-staging -> beacon-staging.
export function beaconUrlFor(apiBase: string): string {
	const url = new URL(apiBase);
	url.hostname = url.hostname.replace(/^api(?=[.-])/, 'beacon');
	url.pathname = '/b.gif';
	return url.toString();
}

export async function foxFormApiRequest(
	this: FoxFormContext,
	method: IHttpRequestMethods,
	path: string,
	qs: IDataObject = {},
): Promise<IDataObject> {
	const baseURL = await apiBaseUrl.call(this);
	return (await this.helpers.httpRequestWithAuthentication.call(this, 'foxFormApi', {
		method,
		baseURL,
		url: path,
		qs,
		json: true,
	})) as IDataObject;
}

export async function getForm(this: FoxFormContext, formId: string): Promise<FoxFormForm> {
	const res = await foxFormApiRequest.call(this, 'GET', `/forms/${encodeURIComponent(formId)}`);
	return res.data as FoxFormForm;
}

// Every page of a list endpoint ({ data: [...] }), up to `limit` items.
export async function getList(
	this: FoxFormContext,
	path: string,
	limit = Infinity,
): Promise<IDataObject[]> {
	const out: IDataObject[] = [];
	const pageSize = Math.min(100, limit);
	for (let page = 1; out.length < limit; page++) {
		const res = await foxFormApiRequest.call(this, 'GET', path, { page, limit: pageSize });
		const items = (res.data as IDataObject[]) || [];
		out.push(...items);
		if (items.length < pageSize) break;
	}
	return out.slice(0, limit);
}

// Questions as respondents see them: the published version when there is one.
export function liveQuestions(form: FoxFormForm): FoxFormQuestion[] {
	return form.published_snapshot?.questions || form.questions || [];
}

export function questionId(q: FoxFormQuestion): string | undefined {
	return q.id || (q._id ? String(q._id) : undefined);
}

// Answers keyed by question title instead of the internal id, like the webhook
// payload and the Zapier trigger: it is what people map in a workflow.
export function answersByTitle(form: FoxFormForm, answers: IDataObject = {}): IDataObject {
	const titles = new Map<string, string>();
	(form.questions || []).forEach((q, i) => {
		const id = questionId(q);
		if (id) titles.set(id, q.title || q.label || `Question ${i + 1}`);
	});
	const out: IDataObject = {};
	for (const [id, value] of Object.entries(answers)) out[titles.get(id) || id] = value;
	return out;
}

export function simplifyResponse(form: FoxFormForm, r: IDataObject): IDataObject {
	const metadata = r.metadata as IDataObject | undefined;
	return {
		id: r.id,
		form_id: form.id,
		form_title: form.title || '',
		submitted_at: r.submitted_at,
		answers: answersByTitle(form, r.answers as IDataObject),
		...(metadata?.utm ? { utm: metadata.utm } : {}),
	};
}

export async function loadForms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const forms = await getList.call(this, '/forms');
	return forms.map((f) => ({
		name: `${(f.title as string) || 'Untitled form'}${f.status === 'published' ? '' : ` (${f.status as string})`}`,
		value: f.id as string,
	}));
}
