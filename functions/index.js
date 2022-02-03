const functions = require('firebase-functions');
const admin = require('firebase-admin');
require('dotenv').config();

admin.initializeApp();

const dbRef = admin.firestore().doc('tokens/demo');

const twitterApi = require('twitter-api-v2').default;
const twitterClient = new twitterApi({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET
});

const callbackUrl = 'http://127.0.0.1:5000/twitter-bot-e52b4/us-central1/callback';

exports.auth = functions.https.onRequest((request, response) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(callbackUrl, {
    scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access']
  });

  dbRef.set({ codeVerifier, state });

  response.redirect(url);
});

exports.callback = functions.https.onRequest((request, response) => {
  const { state, code } = request.query;
  const dbSnapshot = dbRef.get();
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

exports.tweet = functions.https.onRequest((request, response) => {});
