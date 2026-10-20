const e = process.env;

export const config = {
  port: Number(e.PORT) || 3000,
  region: e.AWS_REGION || 'us-east-1',
  // Safe by default: no AWS call is made unless DEMO_MODE=false is set explicitly.
  demo: e.DEMO_MODE !== 'false',
  sms: { originationId: e.EUM_SMS_ORIGINATION_ID, configSet: e.EUM_CONFIG_SET },
  rcs: { agentId: e.EUM_RCS_AGENT_ID, ttl: e.RCS_TTL_SECONDS ? Number(e.RCS_TTL_SECONDS) : undefined },
  wa: { phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID, metaApiVersion: e.WHATSAPP_META_API_VERSION || 'v20.0' },
  ses: { from: e.SES_FROM_ADDRESS },
  agent: { arn: e.AGENTCORE_RUNTIME_ARN, qualifier: e.AGENTCORE_QUALIFIER || 'DEFAULT' },
  sns: { topicArn: e.SNS_TOPIC_ARN },
  adminToken: e.ADMIN_TOKEN,
  defaultLang: 'en',
};
