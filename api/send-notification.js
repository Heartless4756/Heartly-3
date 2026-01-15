import admin from 'firebase-admin';

// Helper to safely format private key
const getPrivateKey = () => {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!key) return undefined;
  // Handle both escaped newlines (from .env) and real newlines
  return key.replace(/\\n/g, '\n');
};

// Initialize Firebase Admin (Backend SDK)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: getPrivateKey(),
      }),
    });
    console.log("Firebase Admin Initialized Successfully");
  } catch (error) {
    console.error("Firebase Admin Init Error:", error);
  }
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
        console.warn(`User ${recipientId} not found`);
        return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const fcmToken = userData.fcmToken;

    if (!fcmToken) {
        console.warn(`User ${recipientId} has no FCM token`);
        return res.status(200).json({ message: 'User has no FCM token, notification skipped' });
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
    console.log("Notification sent successfully:", response);
    res.status(200).json({ success: true, messageId: response });

  } catch (error) {
    console.error('Error sending notification API:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}