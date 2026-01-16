import admin from 'firebase-admin';

// Helper to safely format private key
const getPrivateKey = () => {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!key) return undefined;
  
  let formattedKey = key;
  
  // 1. Remove surrounding quotes if present (Common Vercel env var issue)
  if (formattedKey.startsWith('"') && formattedKey.endsWith('"')) {
    formattedKey = formattedKey.slice(1, -1);
  }

  // 2. Replace escaped newlines with actual newlines
  formattedKey = formattedKey.replace(/\\n/g, '\n');

  return formattedKey;
};

// Initialize Firebase Admin (Backend SDK)
if (!admin.apps.length) {
  try {
    const privateKey = getPrivateKey();
    if (!privateKey) {
        throw new Error("FIREBASE_PRIVATE_KEY is missing");
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
    console.log("Firebase Admin Initialized Successfully");
  } catch (error) {
    console.error("Firebase Admin Init Error:", error.message);
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

    // Hybrid Message: Includes both 'notification' (for system tray) and 'data' (for logic)
    // This ensures delivery even if the Service Worker handling is quirky on some devices.
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
        click_action: '/', // Legacy support
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
            badge: '/icon.png'
        }
      }
    };

    // Send via FCM
    const response = await admin.messaging().send(message);
    console.log("Notification sent successfully:", response);
    res.status(200).json({ success: true, messageId: response });

  } catch (error) {
    console.error('Error sending notification API:', error);
    // Provide explicit error to client for debugging
    res.status(500).json({ 
        error: error.message, 
        code: error.code || 'unknown'
    });
  }
}