const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Configuration, OpenAIApi } = require('openai');

admin.initializeApp();

const dbRef = admin.firestore().doc('tokens/demo');

const twitterApi = require('twitter-api-v2').default;
const twitterClient = new twitterApi({
  clientId: functions.config().twitter.id,
  clientSecret: functions.config().twitter.secret
});

const callbackUrl = functions.config().serv.callbackurl;

const configuration = new Configuration({
  organization: functions.config().openai.org,
  apiKey: functions.config().openai.key
});

const openai = new OpenAIApi(configuration);

exports.auth = functions.https.onRequest(async (_request, response) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(callbackUrl, {
    scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access']
  });

  await dbRef.set({ codeVerifier, state });

  response.redirect(url);
});

exports.callback = functions.https.onRequest(async (request, response) => {
  const { state, code } = request.query;
  const dbSnapshot = await dbRef.get();
  const { codeVerifier, state: storedState } = dbSnapshot.data();

  if (state !== storedState) {
    return response.status(400).send('Stored tokens do not match');
  }

  const {
    client: loggedClient,
    accessToken,
    refreshToken
  } = await twitterClient.loginWithOAuth2({ code, codeVerifier, redirectUri: callbackUrl });

  await dbRef.set({ accessToken, refreshToken });

  response.sendStatus(200);
});

exports.tweet = functions.https.onRequest(async (_request, response) => {
  const { refreshToken } = (await dbRef.get()).data();

  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken
  } = await twitterClient.refreshOAuth2Token(refreshToken);

  await dbRef.set({ accessToken, refreshToken: newRefreshToken });

  const nextTweet = await openai.createCompletion('text-davinci-001', {
    prompt: 'Tweet something cool for #techtwitter',
    max_tokens: 64
  });

  const { data } = await refreshedClient.v2.tweet(nextTweet.data.choices[0].text);

  response.send(data);
});

exports.scheduleJobs = functions.pubsub.schedule('every 3 hours').onRun(async () => {
  await this.auth();
  await this.callback();
  await this.tweet();
});
