import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

// FoxForm API key (ff_live_...), sent as x-api-key like every other API client
// (Zapier, Make, MCP). A read key is enough for the trigger and the lookups;
// submitting a response goes to the public beacon and needs no scope.
export class FoxFormApi implements ICredentialType {
	name = 'foxFormApi';

	displayName = 'FoxForm API';

	icon: Icon = { light: 'file:../icons/foxform.svg', dark: 'file:../icons/foxform.dark.svg' };

	documentationUrl = 'https://app.foxform.app/mcp';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'In FoxForm, open MCP & API and create an API key (it starts with ff_live_)',
		},
		{
			displayName: 'API URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.foxform.app',
			description: 'Leave as is. Only change it to test against another FoxForm environment.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/forms',
			qs: { limit: 1 },
		},
	};
}
