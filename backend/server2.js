const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const authenticateToken = require("./middleware");

const cropQualityRouter = require("./cropquality");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/auth", require("./auth"));
app.use("/ai/crop-quality", cropQualityRouter);

/* =========================================================
   BASIC ROUTES
========================================================= */

app.get("/", (req, res) => {
  res.json({
    message: "SIH-AGRI backend is running"
  });
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      connected: true,
      time: result.rows[0].now
    });
  } catch (error) {
    console.error(
      "Database connection error:",
      error.message
    );

    res.status(500).json({
      connected: false,
      error: "Database connection failed"
    });
  }
});

/* =========================================================
   PAYMENT / DELIVERY TABLE SETUP
========================================================= */

async function initializePaymentTables() {

  /*
    Add delivery columns to existing orders table.
    IF NOT EXISTS makes server restarts safe.
  */

  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(30),
      ADD COLUMN IF NOT EXISTS delivery_address TEXT,
      ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(100),
      ADD COLUMN IF NOT EXISTS delivery_pincode VARCHAR(20),
      ADD COLUMN IF NOT EXISTS delivery_phone VARCHAR(30),
      ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(30)
        DEFAULT 'pending'
  `);


  /*
    Farmer payment details.

    Each farmer has one payment-details row.
  */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS farmer_payment_details (
      id SERIAL PRIMARY KEY,

      farmer_id INTEGER NOT NULL UNIQUE,

      upi_id VARCHAR(255),

      bank_account_name VARCHAR(255),

      bank_account_number VARCHAR(100),

      bank_ifsc VARCHAR(50),

      qr_code_url TEXT,

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

      updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);


  /*
    Payment record for every order.
  */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,

      order_id INTEGER NOT NULL UNIQUE,

      payment_method VARCHAR(50) NOT NULL,

      payment_status VARCHAR(50)
        NOT NULL DEFAULT 'pending',

      transaction_id VARCHAR(255),

      amount NUMERIC(12,2) NOT NULL,

      paid_at TIMESTAMP NULL,

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

      updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    )
  `);


  /*
    Existing databases may already have these columns.
  */

  await pool.query(`
    ALTER TABLE farmer_payment_details
      ADD COLUMN IF NOT EXISTS qr_code_url TEXT
  `);

  await pool.query(`
    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
  `);


  console.log(
    "Payment tables ready"
  );
}


/* =========================================================
   LISTINGS
========================================================= */

app.get(
  "/listings",
  async (req, res) => {

    try {

      const result =
        await pool.query(`
          SELECT
            listings.id,
            listings.farmer_id,

            users.name
              AS farmer_name,

            users.phone
              AS farmer_phone,

            listings.crop_name,
            listings.quantity,
            listings.unit,
            listings.price_per_unit,
            listings.location,
            listings.description,
            listings.status,
            listings.created_at

          FROM listings

          JOIN users
            ON listings.farmer_id =
               users.id

          ORDER BY
            listings.created_at DESC
        `);


      res.json(
        result.rows
      );

    } catch (error) {

      console.error(
        "Listings error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to fetch listings"
      });

    }

  }
);


/* =========================================================
   CREATE LISTING
========================================================= */

app.post(
  "/listings",
  authenticateToken,
  async (req, res) => {

    try {

      const {
        crop_name,
        quantity,
        unit,
        price_per_unit,
        location,
        description
      } = req.body;


      if (
        !crop_name ||
        !quantity ||
        !unit ||
        price_per_unit === undefined
      ) {

        return res.status(400).json({
          message:
            "Crop name, quantity, unit and price are required"
        });

      }


      if (
        req.user.role !==
        "farmer"
      ) {

        return res.status(403).json({
          message:
            "Only farmers can create listings"
        });

      }


      if (
        Number(quantity) <= 0 ||
        Number(price_per_unit) < 0
      ) {

        return res.status(400).json({
          message:
            "Quantity must be greater than 0 and price cannot be negative"
        });

      }


      const result =
        await pool.query(
          `INSERT INTO listings
          (
            farmer_id,
            crop_name,
            quantity,
            unit,
            price_per_unit,
            location,
            description
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )

          RETURNING *`,

          [
            req.user.id,

            crop_name.trim(),

            quantity,

            unit.trim(),

            price_per_unit,

            location?.trim() ||
              null,

            description?.trim() ||
              null
          ]
        );


      res.status(201).json({

        message:
          "Listing created successfully",

        listing:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Create listing error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to create listing"
      });

    }

  }
);


/* =========================================================
   UPDATE LISTING
========================================================= */

app.put(
  "/listings/:id",
  authenticateToken,
  async (req, res) => {

    try {

      const listingId =
        req.params.id;


      if (
        req.user.role !==
        "farmer"
      ) {

        return res.status(403).json({
          message:
            "Only farmers can update listings"
        });

      }


      const existingListing =
        await pool.query(
          `SELECT *
           FROM listings
           WHERE id = $1`,
          [listingId]
        );


      if (
        existingListing.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Listing not found"
        });

      }


      if (
        Number(
          existingListing.rows[0]
            .farmer_id
        ) !==
        Number(req.user.id)
      ) {

        return res.status(403).json({
          message:
            "You can only update your own listings"
        });

      }


      const {
        crop_name,
        quantity,
        unit,
        price_per_unit,
        location,
        description,
        status
      } = req.body;


      const result =
        await pool.query(
          `UPDATE listings

           SET

             crop_name =
               COALESCE(
                 $1,
                 crop_name
               ),

             quantity =
               COALESCE(
                 $2,
                 quantity
               ),

             unit =
               COALESCE(
                 $3,
                 unit
               ),

             price_per_unit =
               COALESCE(
                 $4,
                 price_per_unit
               ),

             location =
               COALESCE(
                 $5,
                 location
               ),

             description =
               COALESCE(
                 $6,
                 description
               ),

             status =
               COALESCE(
                 $7,
                 status
               )

           WHERE id = $8

           RETURNING *`,

          [
            crop_name?.trim() ||
              null,

            quantity ??
              null,

            unit?.trim() ||
              null,

            price_per_unit ??
              null,

            location?.trim() ||
              null,

            description?.trim() ||
              null,

            status ||
              null,

            listingId
          ]
        );


      res.json({

        message:
          "Listing updated successfully",

        listing:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Update listing error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to update listing"
      });

    }

  }
);


/* =========================================================
   DELETE LISTING
========================================================= */

app.delete(
  "/listings/:id",
  authenticateToken,
  async (req, res) => {

    try {

      const listingId =
        req.params.id;


      if (
        req.user.role !==
        "farmer"
      ) {

        return res.status(403).json({
          message:
            "Only farmers can delete listings"
        });

      }


      const existingListing =
        await pool.query(
          `SELECT *
           FROM listings
           WHERE id = $1`,
          [listingId]
        );


      if (
        existingListing.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Listing not found"
        });

      }


      if (
        Number(
          existingListing.rows[0]
            .farmer_id
        ) !==
        Number(req.user.id)
      ) {

        return res.status(403).json({
          message:
            "You can only delete your own listings"
        });

      }


      await pool.query(
        `DELETE FROM listings
         WHERE id = $1`,
        [listingId]
      );


      res.json({

        message:
          "Listing deleted successfully"

      });

    } catch (error) {

      console.error(
        "Delete listing error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to delete listing"
      });

    }

  }
);


/* =========================================================
   FARMER PAYMENT DETAILS
========================================================= */

app.get(
  "/payment-details",
  authenticateToken,
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `SELECT

             farmer_id,

             upi_id,

             bank_account_name,

             bank_account_number,

             bank_ifsc,

             qr_code_url,

             created_at,

             updated_at

           FROM farmer_payment_details

           WHERE farmer_id = $1`,

          [req.user.id]
        );


      if (
        result.rows.length ===
        0
      ) {

        return res.json({

          exists: false,

          details: null

        });

      }


      res.json({

        exists: true,

        details:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Payment details error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to fetch payment details"
      });

    }

  }
);


/* =========================================================
   SAVE FARMER PAYMENT DETAILS
========================================================= */

app.post(
  "/payment-details",
  authenticateToken,
  async (req, res) => {

    try {

      if (
        req.user.role !==
        "farmer"
      ) {

        return res.status(403).json({
          message:
            "Only farmers can add payment details"
        });

      }


      const {
        upi_id,
        bank_account_name,
        bank_account_number,
        bank_ifsc,
        qr_code_url
      } = req.body;


      if (
        !upi_id &&
        !bank_account_number &&
        !qr_code_url
      ) {

        return res.status(400).json({
          message:
            "Add at least UPI, bank account or QR details"
        });

      }


      if (
        qr_code_url &&
        qr_code_url.length >
        8 * 1024 * 1024
      ) {

        return res.status(400).json({
          message:
            "QR image is too large. Use an image below 8 MB."
        });

      }


      const result =
        await pool.query(

          `INSERT INTO
           farmer_payment_details
           (
             farmer_id,
             upi_id,
             bank_account_name,
             bank_account_number,
             bank_ifsc,
             qr_code_url
           )

           VALUES
           (
             $1,
             $2,
             $3,
             $4,
             $5,
             $6
           )

           ON CONFLICT
           (farmer_id)

           DO UPDATE SET

             upi_id =
               EXCLUDED.upi_id,

             bank_account_name =
               EXCLUDED.bank_account_name,

             bank_account_number =
               EXCLUDED.bank_account_number,

             bank_ifsc =
               EXCLUDED.bank_ifsc,

             qr_code_url =
               EXCLUDED.qr_code_url,

             updated_at =
               CURRENT_TIMESTAMP

           RETURNING *`,

          [

            req.user.id,

            upi_id?.trim() ||
              null,

            bank_account_name?.trim() ||
              null,

            bank_account_number?.trim() ||
              null,

            bank_ifsc?.trim() ||
              null,

            qr_code_url ||
              null

          ]

        );


      res.json({

        message:
          "Payment details saved successfully",

        details:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Save payment details error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to save payment details"
      });

    }

  }
);


/* =========================================================
   GET PAYMENT DETAILS FOR A LISTING
========================================================= */

app.get(
  "/listings/:id/payment-details",
  authenticateToken,
  async (req, res) => {

    try {

      const listingId =
        req.params.id;


      const result =
        await pool.query(

          `SELECT

             listings.id
               AS listing_id,

             listings.crop_name,

             listings.farmer_id,

             users.name
               AS farmer_name,

             farmer_payment_details.upi_id,

             farmer_payment_details.bank_account_name,

             farmer_payment_details.bank_account_number,

             farmer_payment_details.bank_ifsc,

             farmer_payment_details.qr_code_url

           FROM listings

           JOIN users
             ON listings.farmer_id =
                users.id

           LEFT JOIN
             farmer_payment_details

             ON listings.farmer_id =
                farmer_payment_details.farmer_id

           WHERE listings.id =
                 $1`,

          [listingId]

        );


      if (
        result.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Listing not found"
        });

      }


      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.error(
        "Listing payment details error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to fetch seller payment details"
      });

    }

  }
);


/* =========================================================
   CREATE ORDER
========================================================= */

app.post(
  "/orders",
  authenticateToken,
  async (req, res) => {

    const client =
      await pool.connect();


    try {

      const {
        listing_id,
        quantity,
        payment_method,
        transaction_id
      } = req.body;


      if (
        !listing_id ||
        !quantity ||
        Number(quantity) <= 0
      ) {

        return res.status(400).json({
          message:
            "Listing ID and valid quantity are required"
        });

      }


      const allowedPaymentMethods = [
        "upi",
        "bank_transfer",
        "offline"
      ];


      if (
        !allowedPaymentMethods.includes(
          payment_method
        )
      ) {

        return res.status(400).json({
          message:
            "Valid payment method is required: upi, bank_transfer or offline"
        });

      }


      if (
        payment_method !==
          "offline" &&
        (
          !transaction_id ||
          !transaction_id.trim()
        )
      ) {

        return res.status(400).json({
          message:
            "Transaction ID is required for UPI or bank transfer"
        });

      }


      await client.query(
        "BEGIN"
      );


      const listingResult =
        await client.query(

          `SELECT *

           FROM listings

           WHERE id = $1

           FOR UPDATE`,

          [listing_id]

        );


      if (
        listingResult.rows.length ===
        0
      ) {

        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          message:
            "Listing not found"
        });

      }


      const listing =
        listingResult.rows[0];


      if (
        listing.status !==
        "available"
      ) {

        await client.query(
          "ROLLBACK"
        );

        return res.status(400).json({
          message:
            "Listing is not available"
        });

      }


      if (
        Number(quantity) >
        Number(listing.quantity)
      ) {

        await client.query(
          "ROLLBACK"
        );

        return res.status(400).json({
          message:
            "Requested quantity exceeds available quantity"
        });

      }


      if (
        Number(listing.farmer_id) ===
        Number(req.user.id)
      ) {

        await client.query(
          "ROLLBACK"
        );

        return res.status(400).json({
          message:
            "You cannot order your own listing"
        });

      }


      const totalPrice =
        Number(quantity) *
        Number(
          listing.price_per_unit
        );


      const orderResult =
        await client.query(

          `INSERT INTO orders
           (
             buyer_id,
             listing_id,
             quantity,
             total_price,
             status
           )

           VALUES
           (
             $1,
             $2,
             $3,
             $4,
             'pending'
           )

           RETURNING *`,

          [
            req.user.id,
            listing_id,
            quantity,
            totalPrice
          ]

        );


      const order =
        orderResult.rows[0];


      const remainingQuantity =
        Number(
          listing.quantity
        ) -
        Number(quantity);


      const newStatus =
        remainingQuantity === 0
          ? "sold"
          : "available";


      await client.query(

        `UPDATE listings

         SET

           quantity = $1,

           status = $2

         WHERE id = $3`,

        [
          remainingQuantity,
          newStatus,
          listing_id
        ]

      );


      const paymentStatus =
        payment_method ===
        "offline"
          ? "pending"
          : "submitted";


      const paymentResult =
        await client.query(

          `INSERT INTO payments
           (
             order_id,
             payment_method,
             payment_status,
             transaction_id,
             amount
           )

           VALUES
           (
             $1,
             $2,
             $3,
             $4,
             $5
           )

           RETURNING *`,

          [
            order.id,

            payment_method,

            paymentStatus,

            transaction_id
              ? transaction_id.trim()
              : null,

            totalPrice
          ]

        );


      await client.query(
        "COMMIT"
      );


      res.status(201).json({

        message:
          payment_method ===
          "offline"

            ? "Order created. Awaiting offline payment confirmation."

            : "Order created and payment submitted for verification.",

        order,

        payment:
          paymentResult.rows[0]

      });

    } catch (error) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      console.error(
        "Create order/payment error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to create order"
      });

    } finally {

      client.release();

    }

  }
);


/* =========================================================
   BUYER ORDERS
========================================================= */

app.get(
  "/orders",
  authenticateToken,
  async (req, res) => {

    try {

      const result =
        await pool.query(

          `SELECT

             orders.id,

             orders.buyer_id,

             orders.listing_id,

             listings.crop_name,

             listings.unit,

             listings.price_per_unit,

             orders.quantity,

             orders.total_price,

             orders.status,

             orders.created_at,

             orders.delivery_method,

             orders.delivery_address,

             orders.delivery_city,

             orders.delivery_pincode,

             orders.delivery_phone,

             orders.delivery_status,

             payments.payment_method,

             payments.payment_status,

             payments.transaction_id,

             payments.paid_at

           FROM orders

           JOIN listings
             ON orders.listing_id =
                listings.id

           LEFT JOIN payments
             ON orders.id =
                payments.order_id

           WHERE orders.buyer_id =
                 $1

           ORDER BY
             orders.created_at DESC`,

          [req.user.id]

        );


      res.json(
        result.rows
      );

    } catch (error) {

      console.error(
        "Orders error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to fetch orders"
      });

    }

  }
);


/* =========================================================
   END PART 1
========================================================= */
/* =========================================================
   FARMER SALES ORDERS
========================================================= */

app.get(
  "/farmer/orders",
  authenticateToken,
  async (req, res) => {

    try {

      if (req.user.role !== "farmer") {
        return res.status(403).json({
          message:
            "Only farmers can view farmer sales"
        });
      }


      const result =
        await pool.query(

          `SELECT

             orders.id,

             orders.buyer_id,

             users.name
               AS buyer_name,

             users.phone
               AS buyer_phone,

             orders.listing_id,

             listings.crop_name,

             orders.quantity,

             listings.unit,

             listings.price_per_unit,

             orders.total_price,

             orders.status,

             orders.created_at,

             orders.delivery_method,

             orders.delivery_address,

             orders.delivery_city,

             orders.delivery_pincode,

             orders.delivery_phone,

             orders.delivery_status,

             payments.payment_method,

             payments.payment_status,

             payments.transaction_id,

             payments.paid_at

           FROM orders

           JOIN listings
             ON orders.listing_id =
                listings.id

           JOIN users
             ON orders.buyer_id =
                users.id

           LEFT JOIN payments
             ON orders.id =
                payments.order_id

           WHERE listings.farmer_id =
                 $1

           ORDER BY
             orders.created_at DESC`,

          [req.user.id]

        );


      res.json(
        result.rows
      );

    } catch (error) {

      console.error(
        "Farmer orders error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to fetch farmer orders"
      });

    }

  }
);


/* =========================================================
   GET SINGLE ORDER PAYMENT
========================================================= */

app.get(
  "/orders/:id/payment",
  authenticateToken,
  async (req, res) => {

    try {

      const orderId =
        req.params.id;


      const result =
        await pool.query(

          `SELECT

             payments.*,

             orders.buyer_id,

             listings.farmer_id

           FROM payments

           JOIN orders
             ON payments.order_id =
                orders.id

           JOIN listings
             ON orders.listing_id =
                listings.id

           WHERE payments.order_id =
                 $1`,

          [orderId]

        );


      if (
        result.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Payment not found"
        });

      }


      const payment =
        result.rows[0];


      const isBuyer =
        Number(
          payment.buyer_id
        ) ===
        Number(req.user.id);


      const isFarmer =
        Number(
          payment.farmer_id
        ) ===
        Number(req.user.id);


      if (
        !isBuyer &&
        !isFarmer
      ) {

        return res.status(403).json({
          message:
            "You cannot view this payment"
        });

      }


      res.json(
        payment
      );

    } catch (error) {

      console.error(
        "Get order payment error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to fetch payment"
      });

    }

  }
);


/* =========================================================
   SUBMIT / UPDATE PAYMENT
========================================================= */

app.post(
  "/orders/:id/payment",
  authenticateToken,
  async (req, res) => {

    try {

      const orderId =
        req.params.id;


      const {
        payment_method,
        transaction_id
      } = req.body;


      const allowedPaymentMethods = [
        "upi",
        "bank_transfer",
        "offline"
      ];


      if (
        !allowedPaymentMethods.includes(
          payment_method
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid payment method"
        });

      }


      if (
        payment_method !==
          "offline" &&
        (
          !transaction_id ||
          !transaction_id.trim()
        )
      ) {

        return res.status(400).json({
          message:
            "Transaction ID is required"
        });

      }


      const orderResult =
        await pool.query(

          `SELECT

             orders.*,

             listings.farmer_id

           FROM orders

           JOIN listings
             ON orders.listing_id =
                listings.id

           WHERE orders.id =
                 $1`,

          [orderId]

        );


      if (
        orderResult.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Order not found"
        });

      }


      const order =
        orderResult.rows[0];


      if (
        Number(order.buyer_id) !==
        Number(req.user.id)
      ) {

        return res.status(403).json({
          message:
            "You can only submit payment for your own orders"
        });

      }


      const paymentStatus =
        payment_method ===
        "offline"

          ? "pending"

          : "submitted";


      const result =
        await pool.query(

          `UPDATE payments

           SET

             payment_method = $1,

             payment_status = $2,

             transaction_id = $3,

             updated_at =
               CURRENT_TIMESTAMP

           WHERE order_id = $4

           RETURNING *`,

          [

            payment_method,

            paymentStatus,

            transaction_id
              ? transaction_id.trim()
              : null,

            orderId

          ]

        );


      if (
        result.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Payment record not found"
        });

      }


      res.json({

        message:
          "Payment submitted successfully",

        payment:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Submit payment error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to submit payment"
      });

    }

  }
);


/* =========================================================
   FARMER VERIFIES PAYMENT
========================================================= */

app.patch(
  "/orders/:id/payment/verify",
  authenticateToken,
  async (req, res) => {

    try {

      const orderId =
        req.params.id;

      const { action } =
        req.body;


      if (
        ![
          "verify",
          "reject"
        ].includes(action)
      ) {

        return res.status(400).json({
          message:
            "Action must be verify or reject"
        });

      }


      if (
        req.user.role !==
        "farmer"
      ) {

        return res.status(403).json({
          message:
            "Only farmers can verify payments"
        });

      }


      const orderResult =
        await pool.query(

          `SELECT

             orders.*,

             listings.farmer_id

           FROM orders

           JOIN listings
             ON orders.listing_id =
                listings.id

           WHERE orders.id =
                 $1`,

          [orderId]

        );


      if (
        orderResult.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Order not found"
        });

      }


      const order =
        orderResult.rows[0];


      if (
        Number(order.farmer_id) !==
        Number(req.user.id)
      ) {

        return res.status(403).json({
          message:
            "You can only verify payments for your own listings"
        });

      }


      const paymentResult =
        await pool.query(

          `SELECT *

           FROM payments

           WHERE order_id = $1`,

          [orderId]

        );


      if (
        paymentResult.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Payment not found"
        });

      }


      const payment =
        paymentResult.rows[0];


      if (
        ![
          "submitted",
          "pending"
        ].includes(
          payment.payment_status
        )
      ) {

        return res.status(400).json({
          message:
            `Payment is already ${payment.payment_status}`
        });

      }


      /* -------------------------
         VERIFY
      ------------------------- */

      if (
        action ===
        "verify"
      ) {

        const result =
          await pool.query(

            `UPDATE payments

             SET

               payment_status =
                 'verified',

               paid_at =
                 CURRENT_TIMESTAMP,

               updated_at =
                 CURRENT_TIMESTAMP

             WHERE order_id = $1

             RETURNING *`,

            [orderId]

          );


        return res.json({

          message:
            "Payment verified successfully",

          payment:
            result.rows[0]

        });

      }


      /* -------------------------
         REJECT
      ------------------------- */

      const result =
        await pool.query(

          `UPDATE payments

           SET

             payment_status =
               'rejected',

             updated_at =
               CURRENT_TIMESTAMP

           WHERE order_id = $1

           RETURNING *`,

          [orderId]

        );


      res.json({

        message:
          "Payment rejected",

        payment:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Payment verification error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to update payment"
      });

    }

  }
);


/* =========================================================
   LOGISTICS
========================================================= */

/*
  Delivery methods:

  buyer_pickup
    Buyer collects the crop from farmer.

  farmer_delivery
    Farmer delivers directly to buyer.

  transporter
    Third-party transporter handles delivery.
*/


/* =========================================================
   SAVE DELIVERY INFORMATION
========================================================= */

app.patch(
  "/orders/:id/delivery",
  authenticateToken,
  async (req, res) => {

    try {

      const orderId =
        req.params.id;


      const {
        delivery_method,
        delivery_address,
        delivery_city,
        delivery_pincode,
        delivery_phone
      } = req.body;


      const allowedMethods = [
        "buyer_pickup",
        "farmer_delivery",
        "transporter"
      ];


      if (
        !allowedMethods.includes(
          delivery_method
        )
      ) {

        return res.status(400).json({

          message:
            "Invalid delivery method. Use buyer_pickup, farmer_delivery or transporter."

        });

      }


      /*
        Get order + farmer information.
      */

      const orderResult =
        await pool.query(

          `SELECT

             orders.*,

             listings.farmer_id,

             listings.location
               AS farmer_location,

             users.phone
               AS farmer_phone

           FROM orders

           JOIN listings
             ON orders.listing_id =
                listings.id

           JOIN users
             ON listings.farmer_id =
                users.id

           WHERE orders.id =
                 $1`,

          [orderId]

        );


      if (
        orderResult.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Order not found"
        });

      }


      const order =
        orderResult.rows[0];


      const isBuyer =
        Number(order.buyer_id) ===
        Number(req.user.id);


      const isFarmer =
        Number(order.farmer_id) ===
        Number(req.user.id);


      if (
        !isBuyer &&
        !isFarmer
      ) {

        return res.status(403).json({
          message:
            "You are not authorized to update this delivery"
        });

      }


      let address;
      let city;
      let pincode;
      let phone;


      /* -------------------------
         BUYER PICKUP
      ------------------------- */

      if (
        delivery_method ===
        "buyer_pickup"
      ) {

        address =
          order.farmer_location ||
          delivery_address?.trim() ||
          "Farmer location not provided";


        city =
          order.farmer_location ||
          delivery_city?.trim() ||
          "Farmer location not provided";


        pincode =
          "N/A";


        phone =
          order.farmer_phone ||
          delivery_phone?.trim() ||
          null;

      }


      /* -------------------------
         FARMER DELIVERY /
         TRANSPORTER
      ------------------------- */

      else {

        if (
          !delivery_address?.trim() ||
          !delivery_city?.trim() ||
          !delivery_pincode?.trim() ||
          !delivery_phone?.trim()
        ) {

          return res.status(400).json({

            message:
              "Complete buyer delivery address, city, pincode and phone are required"

          });

        }


        address =
          delivery_address.trim();


        city =
          delivery_city.trim();


        pincode =
          delivery_pincode.trim();


        phone =
          delivery_phone.trim();

      }


      /*
        Save delivery details.
      */

      const result =
        await pool.query(

          `UPDATE orders

           SET

             delivery_method = $1,

             delivery_address = $2,

             delivery_city = $3,

             delivery_pincode = $4,

             delivery_phone = $5,

             delivery_status =
               'pending'

           WHERE id = $6

           RETURNING *`,

          [

            delivery_method,

            address,

            city,

            pincode,

            phone,

            orderId

          ]

        );


      res.json({

        message:
          "Delivery details saved successfully",

        order:
          result.rows[0]

      });

    } catch (error) {

      console.error(
        "Save delivery details error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to save delivery details"
      });

    }

  }
);


/* =========================================================
   GET DELIVERY INFORMATION
========================================================= */

app.get(
  "/orders/:id/delivery",
  authenticateToken,
  async (req, res) => {

    try {

      const orderId =
        req.params.id;


      const result =
        await pool.query(

          `SELECT

             orders.id,

             orders.buyer_id,

             orders.listing_id,

             orders.delivery_method,

             orders.delivery_address,

             orders.delivery_city,

             orders.delivery_pincode,

             orders.delivery_phone,

             orders.delivery_status,

             listings.crop_name,

             listings.farmer_id,

             listings.location
               AS farmer_location,

             farmer_users.name
               AS farmer_name,

             farmer_users.phone
               AS farmer_phone,

             buyer_users.name
               AS buyer_name,

             buyer_users.phone
               AS buyer_phone

           FROM orders

           JOIN listings
             ON orders.listing_id =
                listings.id

           JOIN users AS farmer_users
             ON listings.farmer_id =
                farmer_users.id

           JOIN users AS buyer_users
             ON orders.buyer_id =
                buyer_users.id

           WHERE orders.id =
                 $1`,

          [orderId]

        );


      if (
        result.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Order not found"
        });

      }


      const order =
        result.rows[0];


      const isBuyer =
        Number(order.buyer_id) ===
        Number(req.user.id);


      const isFarmer =
        Number(order.farmer_id) ===
        Number(req.user.id);


      if (
        !isBuyer &&
        !isFarmer
      ) {

        return res.status(403).json({
          message:
            "You cannot view this delivery"
        });

      }


      res.json(
        order
      );

    } catch (error) {

      console.error(
        "Get delivery error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to fetch delivery details"
      });

    }

  }
);


/* =========================================================
   UPDATE DELIVERY STATUS
========================================================= */

app.patch(
  "/orders/:id/delivery/status",
  authenticateToken,
  async (req, res) => {

    try {

      const orderId =
        req.params.id;


      const {
        delivery_status
      } = req.body;


      const allowedStatuses = [

        "pending",

        "ready_for_pickup",

        "picked_up",

        "in_transit",

        "delivered"

      ];


      if (
        !allowedStatuses.includes(
          delivery_status
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid delivery status"
        });

      }


      const result =
        await pool.query(

          `SELECT

             orders.*,

             listings.farmer_id

           FROM orders

           JOIN listings
             ON orders.listing_id =
                listings.id

           WHERE orders.id =
                 $1`,

          [orderId]

        );


      if (
        result.rows.length ===
        0
      ) {

        return res.status(404).json({
          message:
            "Order not found"
        });

      }


      const order =
        result.rows[0];


      const isBuyer =
        Number(order.buyer_id) ===
        Number(req.user.id);


      const isFarmer =
        Number(order.farmer_id) ===
        Number(req.user.id);


      /*
        Farmer controls normal
        delivery progression.

        Buyer can confirm final
        delivery.
      */

      if (
        delivery_status ===
        "delivered"
      ) {

        if (
          !isBuyer &&
          !isFarmer
        ) {

          return res.status(403).json({
            message:
              "You are not authorized to mark this order delivered"
          });

        }

      } else if (
        !isFarmer
      ) {

        return res.status(403).json({
          message:
            "Only the farmer can update this delivery stage"
        });

      }


      const currentStatus =
        order.delivery_status ||
        "pending";


      /*
        Strict delivery state machine.

        pending
          ↓
        ready_for_pickup
          ↓
        picked_up
          ↓
        in_transit
          ↓
        delivered
      */

      const validTransitions = {

        pending: [
          "ready_for_pickup"
        ],

        ready_for_pickup: [
          "picked_up"
        ],

        picked_up: [
          "in_transit"
        ],

        in_transit: [
          "delivered"
        ],

        delivered: []

      };


      if (
        !validTransitions[
          currentStatus
        ]?.includes(
          delivery_status
        )
      ) {

        return res.status(400).json({

          message:
            `Cannot change delivery status from ${currentStatus} to ${delivery_status}`

        });

      }


      const updated =
        await pool.query(

          `UPDATE orders

           SET

             delivery_status =
               $1

           WHERE id = $2

           RETURNING *`,

          [

            delivery_status,

            orderId

          ]

        );


      /*
        Physical delivery completes
        the marketplace order.
      */

      if (
        delivery_status ===
        "delivered"
      ) {

        await pool.query(

          `UPDATE orders

           SET status =
             'completed'

           WHERE id = $1`,

          [orderId]

        );

      }


      res.json({

        message:
          "Delivery status updated successfully",

        order:
          updated.rows[0]

      });

    } catch (error) {

      console.error(
        "Delivery status error:",
        error.message
      );

      res.status(500).json({
        message:
          "Failed to update delivery status"
      });

    }

  }
);


/* =========================================================
   END OF PART 2
========================================================= */
/* =========================================================
   AI PRICE RECOMMENDATION
========================================================= */

/*
  PRICE MODEL

  The recommendation uses:

  1. Recent AGro marketplace listings
  2. Government MSP where applicable
  3. Current season
  4. Quantity / bulk effect

  IMPORTANT:
  Quality is NOT included here.

  Crop-quality AI will be a separate feature that runs only
  after the farmer uploads crop images.
*/


/* =========================================================
   GOVERNMENT MSP
   2026-27
   INR per kg
========================================================= */

const MSP_2026_27_PER_KG = {

  paddy: 23.69,

  rice: 23.69,

  maize: 24.10,

  bajra: 27.75,

  jowar: 36.99,

  ragi: 48.86,

  arhar: 80.00,

  tur: 80.00,

  moong: 87.68,

  urad: 78.00,

  groundnut: 72.63,

  sunflower: 77.21,

  soybean: 53.28,

  cotton: 77.10,

  sesamum: 98.46,

  nigerseed: 95.37,

  wheat: 25.85,

  barley: 21.50,

  gram: 58.75,

  chana: 58.75,

  masur: 70.00,

  lentil: 70.00,

  mustard: 62.00,

  rapeseed: 62.00,

  safflower: 65.40

};


/* =========================================================
   FALLBACK MARKET REFERENCE

   INR per kg

   These are ONLY fallback values.

   When enough real AGro listings exist for a crop,
   the system uses those actual marketplace prices instead.
========================================================= */

const REFERENCE_MARKET_PRICE_PER_KG = {

  tomato: 30,

  potato: 25,

  onion: 28,

  rice: 40,

  wheat: 32,

  maize: 28,

  corn: 28,

  cotton: 80,

  groundnut: 78,

  soybean: 56,

  gram: 65,

  chana: 65,

  masur: 75,

  mustard: 68,

  paddy: 28,

  bajra: 30,

  jowar: 40,

  ragi: 52,

  arhar: 90,

  tur: 90,

  moong: 98,

  urad: 88

};


/* =========================================================
   SEASONAL FACTORS

   These are conservative MVP adjustments.

   They should NOT replace live market data.
========================================================= */

const SEASONAL_FACTORS = {

  tomato: {
    winter: 1.08,
    summer: 0.92,
    monsoon: 1.02
  },

  potato: {
    winter: 0.92,
    summer: 1.08,
    monsoon: 1.00
  },

  onion: {
    winter: 0.96,
    summer: 1.08,
    monsoon: 1.04
  },

  rice: {
    winter: 1.00,
    summer: 1.03,
    monsoon: 0.98
  },

  paddy: {
    winter: 1.00,
    summer: 1.03,
    monsoon: 0.98
  },

  wheat: {
    winter: 0.98,
    summer: 1.05,
    monsoon: 1.00
  },

  maize: {
    winter: 1.02,
    summer: 1.04,
    monsoon: 0.96
  },

  cotton: {
    winter: 1.03,
    summer: 1.02,
    monsoon: 0.95
  },

  soybean: {
    winter: 1.02,
    summer: 1.04,
    monsoon: 0.96
  },

  groundnut: {
    winter: 1.02,
    summer: 1.04,
    monsoon: 0.97
  }

};


/* =========================================================
   NORMALIZE UNIT TO KG
========================================================= */

function convertToKg(
  quantity,
  unit
) {

  const value =
    Number(quantity);

  const normalizedUnit =
    String(unit)
      .trim()
      .toLowerCase();


  if (
    normalizedUnit === "kg" ||
    normalizedUnit === "kgs" ||
    normalizedUnit === "kilogram" ||
    normalizedUnit === "kilograms"
  ) {

    return value;

  }


  if (
    normalizedUnit === "quintal" ||
    normalizedUnit === "quintals" ||
    normalizedUnit === "q"
  ) {

    return value * 100;

  }


  if (
    normalizedUnit === "ton" ||
    normalizedUnit === "tons" ||
    normalizedUnit === "tonne" ||
    normalizedUnit === "tonnes"
  ) {

    return value * 1000;

  }


  return null;

}


/* =========================================================
   GET CURRENT SEASON
========================================================= */

function getCurrentSeason(
  month
) {

  /*
    November – March
    = winter

    April – June
    = summer

    July – October
    = monsoon
  */

  if (
    [10, 11, 0, 1, 2].includes(
      month
    )
  ) {

    return "winter";

  }


  if (
    [3, 4, 5].includes(
      month
    )
  ) {

    return "summer";

  }


  return "monsoon";

}


/* =========================================================
   SEASON FACTOR
========================================================= */

function getSeasonFactor(
  crop,
  season
) {

  return (
    SEASONAL_FACTORS[
      crop
    ]?.[season] || 1
  );

}


/* =========================================================
   CALCULATE MEDIAN
========================================================= */

function median(
  values
) {

  if (
    !values ||
    values.length === 0
  ) {

    return null;

  }


  const sorted =
    [...values]
      .sort(
        (a, b) => a - b
      );


  const middle =
    Math.floor(
      sorted.length / 2
    );


  if (
    sorted.length % 2 ===
    0
  ) {

    return (
      (
        sorted[middle - 1] +
        sorted[middle]
      ) / 2
    );

  }


  return sorted[middle];

}


/* =========================================================
   FETCH RECENT MARKETPLACE PRICES
========================================================= */

async function getRecentMarketplacePrice(
  cropName
) {

  try {

    const result =
      await pool.query(

        `SELECT
           quantity,
           unit,
           price_per_unit,
           created_at

         FROM listings

         WHERE LOWER(
           TRIM(crop_name)
         ) =
         LOWER(
           TRIM($1)
         )

         AND price_per_unit > 0

         AND quantity > 0

         ORDER BY
           created_at DESC

         LIMIT 50`,

        [cropName]

      );


    const pricesPerKg = [];


    for (
      const row of
      result.rows
    ) {

      const quantityKg =
        convertToKg(
          row.quantity,
          row.unit
        );


      if (
        !quantityKg ||
        quantityKg <= 0
      ) {

        continue;

      }


      const unitName =
        String(row.unit)
          .trim()
          .toLowerCase();


      let pricePerKg;


      /*
        Convert listing price to
        price per kg.
      */

      if (
        unitName === "kg" ||
        unitName === "kgs" ||
        unitName === "kilogram" ||
        unitName === "kilograms"
      ) {

        pricePerKg =
          Number(
            row.price_per_unit
          );

      } else {

        pricePerKg =
          Number(
            row.price_per_unit
          ) /
          (
            quantityKg /
            Number(row.quantity)
          );

      }


      if (
        Number.isFinite(
          pricePerKg
        ) &&
        pricePerKg > 0
      ) {

        pricesPerKg.push(
          pricePerKg
        );

      }

    }


    if (
      pricesPerKg.length === 0
    ) {

      return {

        price: null,

        sampleSize: 0

      };

    }


    return {

      price:
        median(
          pricesPerKg
        ),

      sampleSize:
        pricesPerKg.length

    };


  } catch (error) {

    console.error(
      "Marketplace price lookup error:",
      error.message
    );


    return {

      price: null,

      sampleSize: 0

    };

  }

}


/* =========================================================
   AI PRICE RECOMMENDATION API
========================================================= */

app.post(
  "/ai/price-recommendation",
  authenticateToken,
  async (req, res) => {

    try {

      /* -----------------------------------------
         FARMER ONLY
      ----------------------------------------- */

      if (
        req.user.role !==
        "farmer"
      ) {

        return res.status(403).json({

          message:
            "Only farmers can request an AI price recommendation"

        });

      }


      const {

        crop_name,

        quantity,

        unit,

        location

      } = req.body;


      /* -----------------------------------------
         VALIDATION
      ----------------------------------------- */

      if (
        !crop_name ||
        !quantity ||
        !unit
      ) {

        return res.status(400).json({

          message:
            "Crop name, quantity and unit are required"

        });

      }


      const numericQuantity =
        Number(quantity);


      if (
        !Number.isFinite(
          numericQuantity
        ) ||
        numericQuantity <= 0
      ) {

        return res.status(400).json({

          message:
            "Quantity must be greater than zero"

        });

      }


      const quantityKg =
        convertToKg(
          numericQuantity,
          unit
        );


      if (
        quantityKg === null
      ) {

        return res.status(400).json({

          message:
            "AI pricing supports kg, quintal and ton"

        });

      }


      const crop =
        crop_name
          .trim()
          .toLowerCase();


      /* -----------------------------------------
         CURRENT SEASON
      ----------------------------------------- */

      const currentDate =
        new Date();


      const season =
        getCurrentSeason(
          currentDate.getMonth()
        );


      const seasonFactor =
        getSeasonFactor(
          crop,
          season
        );


      /* -----------------------------------------
         GOVERNMENT MSP
      ----------------------------------------- */

      const mspPerKg =
        MSP_2026_27_PER_KG[
          crop
        ] ?? null;


      /* -----------------------------------------
         MARKETPLACE PRICE
      ----------------------------------------- */

      const marketplace =
        await getRecentMarketplacePrice(
          crop
        );


      const fallbackMarketPrice =
        REFERENCE_MARKET_PRICE_PER_KG[
          crop
        ] ?? null;


      /*
        Prefer actual marketplace data.

        If not enough marketplace data exists,
        use the fallback reference.
      */

      let marketPricePerKg;

      let marketSource;


      if (
        marketplace.price !== null &&
        marketplace.sampleSize >= 3
      ) {

        marketPricePerKg =
          marketplace.price;

        marketSource =
          `AGro marketplace (${marketplace.sampleSize} recent listings)`;

      } else if (
        marketplace.price !== null
      ) {

        marketPricePerKg =
          marketplace.price;

        marketSource =
          `AGro marketplace (${marketplace.sampleSize} recent listing${marketplace.sampleSize === 1 ? "" : "s"})`;

      } else if (
        fallbackMarketPrice !== null
      ) {

        marketPricePerKg =
          fallbackMarketPrice;

        marketSource =
          "Marketplace reference baseline";

      } else {

        marketPricePerKg =
          null;

        marketSource =
          "No market reference available";

      }


      /* -----------------------------------------
         BASE PRICE
      ----------------------------------------- */

      let basePrice;


      if (
        marketPricePerKg !== null
      ) {

        basePrice =
          marketPricePerKg;

      } else if (
        mspPerKg !== null
      ) {

        basePrice =
          mspPerKg;

      } else {

        /*
          No fabricated market price.

          If we have neither market data nor MSP,
          return an error rather than pretending
          the estimate is reliable.
        */

        return res.status(422).json({

          message:
            "Insufficient market data for this crop. Please enter your own price or try again after more market data is available."

        });

      }


      /* -----------------------------------------
         SEASONAL ADJUSTMENT
      ----------------------------------------- */

      let seasonAdjustedPrice =
        basePrice *
        seasonFactor;


      /* -----------------------------------------
         MSP FLOOR
      ----------------------------------------- */

      if (
        mspPerKg !== null
      ) {

        seasonAdjustedPrice =
          Math.max(
            seasonAdjustedPrice,
            mspPerKg
          );

      }


      /* -----------------------------------------
         BULK ADJUSTMENT
      ----------------------------------------- */

      let quantityFactor =
        1;


      if (
        quantityKg >= 1000
      ) {

        quantityFactor =
          0.96;

      } else if (
        quantityKg >= 500
      ) {

        quantityFactor =
          0.98;

      } else if (
        quantityKg >= 100
      ) {

        quantityFactor =
          0.99;

      }


      let suggestedPrice =
        seasonAdjustedPrice *
        quantityFactor;


      /* -----------------------------------------
         MSP FLOOR AGAIN
      ----------------------------------------- */

      if (
        mspPerKg !== null
      ) {

        suggestedPrice =
          Math.max(
            suggestedPrice,
            mspPerKg
          );

      }


      /* -----------------------------------------
         RECOMMENDATION RANGE
      ----------------------------------------- */

      /*
        The range is intentionally shown as a
        negotiation range, NOT as a confidence
        interval.

        No fake confidence percentage.
      */

      const rangePercent =
        marketplace.sampleSize >= 10
          ? 0.05
          : marketplace.sampleSize >= 3
            ? 0.07
            : 0.10;


      const range =
        suggestedPrice *
        rangePercent;


      let minimumPrice =
        suggestedPrice -
        range;


      const maximumPrice =
        suggestedPrice +
        range;


      if (
        mspPerKg !== null
      ) {

        minimumPrice =
          Math.max(
            minimumPrice,
            mspPerKg
          );

      }


      /* -----------------------------------------
         CONVERT TO FARMER'S UNIT
      ----------------------------------------- */

      let suggestedPriceForUnit;

      let minimumPriceForUnit;

      let maximumPriceForUnit;


      const normalizedUnit =
        unit
          .trim()
          .toLowerCase();


      if (
        normalizedUnit ===
          "kg" ||
        normalizedUnit ===
          "kgs" ||
        normalizedUnit ===
          "kilogram" ||
        normalizedUnit ===
          "kilograms"
      ) {

        suggestedPriceForUnit =
          suggestedPrice;

        minimumPriceForUnit =
          minimumPrice;

        maximumPriceForUnit =
          maximumPrice;

      } else if (
        normalizedUnit ===
          "quintal" ||
        normalizedUnit ===
          "quintals" ||
        normalizedUnit ===
          "q"
      ) {

        suggestedPriceForUnit =
          suggestedPrice *
          100;

        minimumPriceForUnit =
          minimumPrice *
          100;

        maximumPriceForUnit =
          maximumPrice *
          100;

      } else {

        suggestedPriceForUnit =
          suggestedPrice *
          1000;

        minimumPriceForUnit =
          minimumPrice *
          1000;

        maximumPriceForUnit =
          maximumPrice *
          1000;

      }


      /* -----------------------------------------
         RESPONSE
      ----------------------------------------- */

      res.json({

        success: true,

        recommendation: {

          crop_name:
            crop_name.trim(),

          quantity:
            numericQuantity,

          quantity_kg:
            Number(
              quantityKg.toFixed(2)
            ),

          unit:
            unit.trim(),

          location:
            location?.trim() ||
            null,


          /*
            MAIN VALUE SHOWN IN UI
          */

          suggested_price:
            Number(
              suggestedPriceForUnit
                .toFixed(2)
            ),


          minimum_price:
            Number(
              minimumPriceForUnit
                .toFixed(2)
            ),


          maximum_price:
            Number(
              maximumPriceForUnit
                .toFixed(2)
            ),


          /*
            Normalized kg values
            useful internally.
          */

          suggested_price_per_kg:
            Number(
              suggestedPrice
                .toFixed(2)
            ),

          minimum_price_per_kg:
            Number(
              minimumPrice
                .toFixed(2)
            ),

          maximum_price_per_kg:
            Number(
              maximumPrice
                .toFixed(2)
            ),


          market_price_per_kg:
            marketPricePerKg !==
              null
              ? Number(
                  marketPricePerKg
                    .toFixed(2)
                )
              : null,


          market_reference_price_per_kg:
            marketPricePerKg !==
              null
              ? Number(
                  marketPricePerKg
                    .toFixed(2)
                )
              : null,


          applicable_msp_per_kg:
            mspPerKg !== null
              ? Number(
                  mspPerKg
                    .toFixed(2)
                )
              : null,


          applicable_msp_for_unit:
            mspPerKg !== null
              ? Number(
                  (
                    mspPerKg *
                    (
                      normalizedUnit ===
                        "kg"
                        ? 1
                        : normalizedUnit ===
                            "quintal"
                          ? 100
                          : 1000
                    )
                  ).toFixed(2)
                )
              : null,


          season:


            season,


          season_factor:
            Number(
              seasonFactor.toFixed(3)
            ),


          quantity_factor:
            quantityFactor,


          market_sample_size:
            marketplace.sampleSize,


          market_data_source:
            marketSource,


          pricing_basis: [

            marketSource,

            mspPerKg !== null
              ? "Government MSP 2026-27"
              : "No applicable MSP found",

            "Seasonal adjustment",

            "Quantity adjustment"

          ],


          /*
            Explicitly no quality analysis.
          */

          quality_analysis:
            null,


          quality_score:
            null,


          confidence:
            null,


          data_status:
            "Market-aware MVP. Live external mandi integration can be connected for production.",


          note:
            "AI-assisted price recommendation. The final selling price is decided by the farmer and buyer."

        }

      });

    } catch (error) {

      console.error(
        "AI price recommendation error:",
        error.message
      );


      res.status(500).json({

        message:
          "Failed to generate AI price recommendation"

      });

    }

  }
);


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.json({

      success: true,

      message:
        "SIH-AGRI backend is healthy",

      timestamp:
        new Date().toISOString()

    });

  }
);


/* =========================================================
   404 HANDLER
========================================================= */

app.use(
  (req, res) => {

    res.status(404).json({

      message:
        "API endpoint not found",

      path:
        req.originalUrl

    });

  }
);


/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "Unhandled server error:",
      error
    );


    res.status(500).json({

      message:
        "Internal server error"

    });

  }
);


/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

  try {

    await initializePaymentTables();


    await pool.query(
      "SELECT 1"
    );


    app.listen(
      PORT,
      () => {

        console.log(
          `Server running on http://localhost:${PORT}`
        );

      }
    );

  } catch (error) {

    console.error(
      "Failed to start server:",
      error.message
    );


    process.exit(1);

  }

}


startServer();


/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

process.on(
  "SIGINT",
  async () => {

    console.log(
      "\nShutting down server..."
    );


    await pool.end();


    process.exit(0);

  }
);


process.on(
  "SIGTERM",
  async () => {

    console.log(
      "\nShutting down server..."
    );


    await pool.end();


    process.exit(0);

  }
);


/* =========================================================
   END OF SERVER.JS
========================================================= */