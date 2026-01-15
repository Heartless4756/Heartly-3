import admin from 'firebase-admin';

// Initialize Firebase Admin (Backend SDK)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Fix newline characters in private key when reading from env vars
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { recipientId, title, body, icon } = req.body;

  if (!recipientId || !title || !body) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const db = admin.firestore();
    
    // Get Recipient's FCM Token
    const userDoc = await db.collection('users').doc(recipientId).get();

    if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const fcmToken = userData.fcmToken;

    if (!fcmToken) {
        return res.status(200).json({ message: 'User has no FCM token' });
    }

    // Construct Message
    const message = {
      notification: {
        title: title,
        body: body,
      },
      token: fcmToken,
      webpush: {
        headers: {
          Urgency: "high"
        },
        notification: {
            icon: icon || '/icon.png',
            badge: '/icon.png',
            requireInteraction: true
        }
      }
    };

    // Send via FCM
    const response = await admin.messaging().send(message);
    res.status(200).json({ success: true, messageId: response });

  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: error.message });
  }
}