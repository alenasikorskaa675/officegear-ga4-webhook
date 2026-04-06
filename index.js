const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const BC_STORE_HASH = '64wwb4pbz6';
const BC_ACCESS_TOKEN = 'p7sx9rh6eoufyni9uqt8hr3qvbyofqa';
const GA4_MEASUREMENT_ID = 'G-VDBLXYPVNC';
const GA4_API_SECRET = 'yvk1vAdhTn6IVSweJ1wwgQ';

const PAID_STATUS = 11;
const processedOrders = new Set();

app.post('/webhooks/bc-order-paid', async (req, res) => {
  try {
    console.log('Incoming webhook:', JSON.stringify(req.body));

    const { scope, data } = req.body;

    if (scope !== 'store/order/statusUpdated') {
      return res.sendStatus(200);
    }

    const orderId = data.id;
    const newStatus = data.status.id;

    console.log(`Order #${orderId}, status: ${newStatus}`);

    if (newStatus !== PAID_STATUS) {
      console.log(`Skipping - status ${newStatus} is not ${PAID_STATUS}`);
      return res.sendStatus(200);
    }

    if (processedOrders.has(orderId)) {
      console.log(`⚠️ Order #${orderId} already processed, skipping`);
      return res.sendStatus(200);
    }

    const orderRes = await axios.get(
      `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v2/orders/${orderId}`,
      {
        headers: {
          'X-Auth-Token': BC_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    const order = orderRes.data;

    const itemsRes = await axios.get(
      `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v2/orders/${orderId}/products`,
      {
        headers: {
          'X-Auth-Token': BC_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    const items = itemsRes.data.map(item => ({
      item_id: String(item.product_id),
      item_name: item.name,
      quantity: item.quantity,
      price: parseFloat(item.base_price)
    }));

    await axios.post(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`,
      {
        client_id: String(order.customer_id || orderId),
        events: [{
          name: 'purchase',
          params: {
            transaction_id: String(orderId),
            value: parseFloat(order.total_inc_tax),
            currency: order.currency_code,
            tax: parseFloat(order.total_tax),
            shipping: parseFloat(order.shipping_cost_inc_tax),
            items: items
          }
        }]
      }
    );

    processedOrders.add(orderId);
    console.log(`✅ GA4 purchase sent for order #${orderId}`);
    res.sendStatus(200);

  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.sendStatus(500);
  }
});

app.listen(3000, () => console.log('Webhook server running on port 3000'));
