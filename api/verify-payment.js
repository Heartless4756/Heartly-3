import crypto from 'crypto';
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

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, amount } = req.body;

  // 1. Verify Signature locally to ensure payment is authentic
  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest('hex');

  if (generated_signature === razorpay_signature) {
    try {
      const db = admin.firestore();
      
      // 2. Add Coins to User's Wallet securely
      await db.collection('users').doc(userId).update({
        walletBalance: admin.firestore.FieldValue.increment(amount)
      });
      
      // 3. Log the transaction (Optional but recommended)
      await db.collection('transactions').add({
        userId,
        amount,
        type: 'credit',
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        createdAt: Date.now(),
        status: 'success'
      });

      res.status(200).json({ success: true, message: 'Payment verified and coins added' });
    } catch (error) {
      console.error("Firebase Update Error:", error);
      res.status(500).json({ success: false, error: 'Database update failed' });
    }
  } else {
    res.status(400).json({ success: false, error: 'Invalid signature. Payment failed.' });
  }
}