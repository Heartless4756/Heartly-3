import admin from 'firebase-admin';

// Helper to safely format private key
const getPrivateKey = () => {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!key) return undefined;
  
  // Handle Vercel's environment variable formatting issues
  // 1. Remove wrapping quotes if they exist
  let formattedKey = key.replace(/^"|"$/g, '');
  
  // 2. Re-introduce proper newlines if they are escaped as literal \n
  if (formattedKey.includes('\\n')) {
      formattedKey = formattedKey.replace(/\\n/g, '\n');
  }
  
  return formattedKey;
};

// Initialize Firebase Admin (Backend SDK)
if (!admin.apps.length) {
  try {
    const privateKey = getPrivateKey();
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    if (!privateKey || !projectId || !clientEmail) {
        throw new Error("Missing Firebase Configuration in Environment Variables");
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log("Firebase Admin Initialized Successfully");
  } catch (error) {
    console.error("Firebase Admin Init Error:", error.message);
  }
}

export default async function handler(req, res) {
  // CORS Headers for API accessibility
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { recipientId, title, body, icon } = req.body;

  if (!recipientId || !title || !body) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    if (!admin.apps.length) {
        return res.status(500).json({ error: 'Firebase Admin not initialized. Check server logs.' });
    }

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

    // Standard FCM Message Payload for Web Push
    const message = {
      notification: {
          title: title,
          body: body,
      },
      data: {
        title: title,
        body: body,
        icon: icon || '/icon.png',
        url: '/', 
        click_action: '/',
        type: 'chat_msg'
      },
      token: fcmToken,
      webpush: {
        headers: {
          Urgency: "high"
        },
        fcm_options: {
           link: '/'
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
    res.status(500).json({ 
        error: error.message || 'Internal Server Error', 
        code: error.code || 'unknown'
    });
  }
}