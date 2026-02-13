export const handler = async (event) => {
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const userEmail = process.env.USER_EMAIL;

  // Your webhook URL
  const webhookUrl = 'https://edaps6b39k.execute-api.us-east-1.amazonaws.com/webhook';

  try {
      // Get access token
      const tokenResponse = await fetch(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                  client_id: clientId,
                  client_secret: clientSecret,
                  scope: 'https://graph.microsoft.com/.default',
                  grant_type: 'client_credentials'
              })
          }
      );

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
          return { statusCode: 401, body: JSON.stringify(tokenData) };
      }
      console.log('✓ Got access token');

      // Create subscription (expires in 3 days - max for mail)
      const expirationDateTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

      const subscriptionResponse = await fetch(
          'https://graph.microsoft.com/v1.0/subscriptions',
          {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${tokenData.access_token}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  changeType: 'created',
                  notificationUrl: webhookUrl,
                  resource: `users/${userEmail}/messages`,
                  expirationDateTime: expirationDateTime,
                  clientState: 'emailClassifierSecret'
              })
          }
      );

      const subscriptionData = await subscriptionResponse.json();

      if (!subscriptionResponse.ok) {
          console.log('Subscription failed:', subscriptionData);
          return { statusCode: 400, body: JSON.stringify(subscriptionData) };
      }

      console.log('✓ Subscription created');
      return {
          statusCode: 200,
          body: JSON.stringify({
              success: true,
              subscriptionId: subscriptionData.id,
              expiresAt: subscriptionData.expirationDateTime
          }, null, 2)
      };

  } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};