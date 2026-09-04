import { useEffect, useMemo, useState } from "react";
import "./App.css";
import agroLogo from "./assets/agro-logo.png";

const API = "http://localhost:5000";

function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("agro_user")) || null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("agro_token") || "");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "", email: "", password: "", phone: "", role: "buyer"
  });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [listings, setListings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [farmerOrders, setFarmerOrders] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [listingsError, setListingsError] = useState("");
  const [ordersError, setOrdersError] = useState("");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingListingId, setEditingListingId] = useState(null);

  // Producer-consumer matching
  const [matchForm, setMatchForm] = useState({
    crop_name: "",
    quantity: "",
    location: "",
    max_price: ""
  });
  const [matches, setMatches] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [matchSearched, setMatchSearched] = useState(false);

  // Multi-farmer order planning
  const [combinedPlan, setCombinedPlan] = useState([]);
  const [combinedMessage, setCombinedMessage] = useState("");

  const [showListingForm, setShowListingForm] = useState(false);
  const [listingSubmitting, setListingSubmitting] = useState(false);
  const [listingForm, setListingForm] = useState({
    crop_name: "", quantity: "", unit: "kg", price_per_unit: "",
    location: "", description: ""
  });

  // AI price recommendation state
  const [aiPriceResult, setAiPriceResult] = useState(null);
  const [aiPriceLoading, setAiPriceLoading] = useState(false);
  const [aiPriceError, setAiPriceError] = useState("");

  // AI crop-quality analysis state
  const [qualityImage, setQualityImage] = useState("");
  const [qualityPreview, setQualityPreview] = useState("");
  const [qualityResult, setQualityResult] = useState(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState("");

  const [buyListing, setBuyListing] = useState(null);
  const [buyQuantity, setBuyQuantity] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [buySubmitting, setBuySubmitting] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [buyError, setBuyError] = useState("");
  const [buySuccess, setBuySuccess] = useState("");

  // Delivery details for buyer orders
  const [deliveryMethod, setDeliveryMethod] = useState("farmer_delivery");
  const [deliveryForm, setDeliveryForm] = useState({
    address: "",
    city: "",
    pincode: "",
    phone: ""
  });
  const [deliveryDetails, setDeliveryDetails] = useState({});
  const [deliveryLoading, setDeliveryLoading] = useState({});
  const [deliveryError, setDeliveryError] = useState({});

  const [paymentSettings, setPaymentSettings] = useState(null);
  const [showPaymentSettings, setShowPaymentSettings] = useState(false);
  const [paymentSettingsForm, setPaymentSettingsForm] = useState({
    upi_id: "", bank_account_name: "", bank_account_number: "",
    bank_ifsc: "", qr_code_url: ""
  });
  const [paymentSettingsMessage, setPaymentSettingsMessage] = useState("");

  const headers = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  });

  const api = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  };

  useEffect(() => {
    if (!user || !token) return;
    loadListings();
    loadOrders();
    if (user.role === "farmer") {
      loadFarmerOrders();
      loadPaymentSettings();
    }
  }, [user, token]);

  const logout = () => {
    localStorage.removeItem("agro_user");
    localStorage.removeItem("agro_token");
    setUser(null);
    setToken("");
  };

  const handleAuthChange = (e) =>
    setAuthForm({ ...authForm, [e.target.name]: e.target.value });

  const submitAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const path = authMode === "login" ? "/auth/login" : "/auth/signup";
      const body = authMode === "login"
        ? { email: authForm.email, password: authForm.password }
        : authForm;
      const data = await api(path, {
        method: "POST",
        body: JSON.stringify(body)
      });
      if (authMode === "signup") {
        setAuthMode("login");
        setAuthError("Account created. Please log in.");
      } else {
        localStorage.setItem("agro_token", data.token);
        localStorage.setItem("agro_user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      }
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const loadListings = async () => {
    setListingsLoading(true);
    setListingsError("");
    try {
      setListings(await api("/listings"));
    } catch (error) {
      setListingsError(error.message);
    } finally {
      setListingsLoading(false);
    }
  };

  const loadOrders = async () => {
    if (!token) return;
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const data = await api("/orders");
      setOrders(data);
      for (const order of data) {
        loadDelivery(order.id);
      }
    } catch (error) {
      setOrdersError(error.message);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadFarmerOrders = async () => {
    if (!token || user?.role !== "farmer") return;
    try {
      const data = await api("/farmer/orders");
      setFarmerOrders(data);
      for (const order of data) {
        loadDelivery(order.id);
      }
    } catch (error) {
      setOrdersError(error.message);
    }
  };

  const loadDelivery = async (orderId) => {
    try {
      const data = await api(`/orders/${orderId}/delivery`);
      setDeliveryDetails((previous) => ({
        ...previous,
        [orderId]: data
      }));
    } catch {
      // Delivery details may not exist yet.
    }
  };

  const deliveryStatusLabel = (status) => {
    const labels = {
      pending: "Pending",
      ready_for_pickup: "Ready for Pickup",
      picked_up: "Picked Up",
      in_transit: "In Transit",
      delivered: "Delivered"
    };
    return labels[status] || status || "Pending";
  };

  const getNextDeliveryStatus = (order, status) => {
    const method = order?.delivery_method || "farmer_delivery";
    if (method === "buyer_pickup") {
      const next = {
        pending: "ready_for_pickup",
        ready_for_pickup: "picked_up",
        picked_up: "delivered"
      };
      return next[status] || null;
    }
    const next = {
      pending: "ready_for_pickup",
      ready_for_pickup: "picked_up",
      picked_up: "in_transit",
      in_transit: "delivered"
    };
    return next[status] || null;
  };

  const updateDeliveryStatus = async (id, status) => {
    setDeliveryLoading((previous) => ({ ...previous, [id]: true }));
    setDeliveryError((previous) => ({ ...previous, [id]: "" }));
    try {
      await api(`/orders/${id}/delivery/status`, {
        method: "PATCH",
        body: JSON.stringify({ delivery_status: status })
      });
      await loadDelivery(id);
      await loadOrders();
      if (user?.role === "farmer") {
        await loadFarmerOrders();
      }
    } catch (error) {
      setDeliveryError((previous) => ({
        ...previous,
        [id]: error.message
      }));
    } finally {
      setDeliveryLoading((previous) => ({ ...previous, [id]: false }));
    }
  };

  const loadPaymentSettings = async () => {
    try {
      const data = await api("/payment-details");
      if (data.details) {
        setPaymentSettings(data.details);
        setPaymentSettingsForm({
          upi_id: data.details.upi_id || "",
          bank_account_name: data.details.bank_account_name || "",
          bank_account_number: data.details.bank_account_number || "",
          bank_ifsc: data.details.bank_ifsc || "",
          qr_code_url: data.details.qr_code_url || ""
        });
      }
    } catch {}
  };

  const handleListingChange = (e) => {
    const { name, value } = e.target;

    setListingForm((previous) => ({
      ...previous,
      [name]: value
    }));

    // Old AI results are invalid after changing price inputs.
    if (["crop_name", "quantity", "unit", "location"].includes(name)) {
      setAiPriceResult(null);
      setAiPriceError("");
    }
  };

  const openListingForm = () => {
    setEditingListingId(null);
    setListingForm({
      crop_name: "", quantity: "", unit: "kg", price_per_unit: "",
      location: "", description: ""
    });
    setAiPriceResult(null);
    setAiPriceError("");
    setQualityImage("");
    setQualityPreview("");
    setQualityResult(null);
    setQualityError("");
    setQualityLoading(false);
    setShowListingForm(true);
  };

  const closeListingForm = () => { setShowListingForm(false); setEditingListingId(null); };

  const getAiPriceRecommendation = async () => {
    setAiPriceError("");
    setAiPriceResult(null);

    const crop = listingForm.crop_name.trim();
    const quantity = Number(listingForm.quantity);
    const unit = listingForm.unit;
    const location = listingForm.location.trim();

    if (!crop) {
      setAiPriceError("Enter the crop name first.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setAiPriceError("Enter a valid quantity first.");
      return;
    }

    if (!["kg", "quintal", "ton"].includes(unit)) {
      setAiPriceError(
        "AI price suggestions currently support kg, quintal and ton."
      );
      return;
    }

    setAiPriceLoading(true);

    try {
      const data = await api("/ai/price-recommendation", {
        method: "POST",
        body: JSON.stringify({
          crop_name: crop,
          quantity,
          unit,
          location: location || null
        })
      });

      const recommendation = data?.recommendation;

      if (!recommendation) {
        throw new Error("No price recommendation was returned.");
      }

      // Accept either naming convention from the backend.
      const suggested = Number(
        recommendation.suggested_price ??
        recommendation.suggested_price_per_kg
      );

      const minimum = Number(
        recommendation.minimum_price ??
        recommendation.minimum_price_per_kg
      );

      const maximum = Number(
        recommendation.maximum_price ??
        recommendation.maximum_price_per_kg
      );

      const market =
        recommendation.market_price_per_kg == null
          ? null
          : Number(recommendation.market_price_per_kg);

      const msp =
        recommendation.applicable_msp_per_kg == null
          ? null
          : Number(recommendation.applicable_msp_per_kg);

      if (!Number.isFinite(suggested)) {
        throw new Error("The server returned an invalid suggested price.");
      }

      setAiPriceResult({
        ...recommendation,
        suggested_price: suggested,
        minimum_price: Number.isFinite(minimum) ? minimum : suggested,
        maximum_price: Number.isFinite(maximum) ? maximum : suggested,
        market_price_per_kg: Number.isFinite(market) ? market : null,
        applicable_msp_per_kg: Number.isFinite(msp) ? msp : null
      });
    } catch (error) {
      console.error("AI price recommendation error:", error);
      setAiPriceError(
        error.message || "Unable to calculate the AI price."
      );
    } finally {
      setAiPriceLoading(false);
    }
  };

  const useAiPrice = () => {
    if (!aiPriceResult) return;

    const suggested = Number(aiPriceResult.suggested_price);

    if (!Number.isFinite(suggested)) {
      setAiPriceError("The suggested price is invalid.");
      return;
    }

    setListingForm((previous) => ({
      ...previous,
      price_per_unit: suggested.toFixed(2)
    }));

    setAiPriceError("");
  };

  const handleQualityImage = (e) => {
    const file = e.target.files?.[0];

    setQualityError("");
    setQualityResult(null);

    if (!file) {
      setQualityImage("");
      setQualityPreview("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setQualityError("Please select an image file.");
      e.target.value = "";
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setQualityError("Image must be 8 MB or smaller.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const base64 = String(reader.result || "");
      setQualityImage(base64);
      setQualityPreview(base64);
    };

    reader.onerror = () => {
      setQualityError("Could not read the selected image.");
      setQualityImage("");
      setQualityPreview("");
    };

    reader.readAsDataURL(file);
  };

  const analyzeCropQuality = async () => {
    setQualityError("");
    setQualityResult(null);

    if (!listingForm.crop_name.trim()) {
      setQualityError("Enter the crop name first.");
      return;
    }

    if (!qualityImage) {
      setQualityError("Upload a crop image first.");
      return;
    }

    setQualityLoading(true);

    try {
      const data = await api("/ai/crop-quality", {
        method: "POST",
        body: JSON.stringify({
          crop_name: listingForm.crop_name.trim(),
          image: qualityImage
        })
      });

      if (!data || !data.grade || !Number.isFinite(Number(data.score))) {
        throw new Error("AI returned an invalid crop-quality result.");
      }

      setQualityResult({
        ...data,
        score: Math.max(0, Math.min(100, Number(data.score))),
        issues: Array.isArray(data.issues) ? data.issues : []
      });
    } catch (error) {
      console.error("AI crop quality error:", error);
      setQualityError(error.message || "Unable to analyze crop quality.");
    } finally {
      setQualityLoading(false);
    }
  };

  const openEditListing = (listing) => {
    setEditingListingId(listing.id);
    setListingForm({
      crop_name: listing.crop_name || "",
      quantity: listing.quantity ?? "",
      unit: listing.unit || "kg",
      price_per_unit: listing.price_per_unit ?? "",
      location: listing.location || "",
      description: listing.description || ""
    });
    setAiPriceResult(null);
    setAiPriceError("");
    setQualityImage("");
    setQualityPreview("");
    setQualityResult(null);
    setQualityError("");
    setQualityLoading(false);
    setShowListingForm(true);
  };

  const deleteListing = async (id) => {
    if (!window.confirm("Delete this listing? This action cannot be undone.")) return;

    try {
      await api(`/listings/${id}`, { method: "DELETE" });
      await loadListings();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleQrImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPaymentSettingsMessage("Please select a valid QR image.");
      e.target.value = "";
      return;
    }

    // Keep the original image below 5 MB so its base64 value remains
    // safely below the backend's 8 MB qr_code_url limit.
    if (file.size > 5 * 1024 * 1024) {
      setPaymentSettingsMessage("QR image must be 5 MB or smaller.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const base64 = String(reader.result || "");

      if (!base64.startsWith("data:image/")) {
        setPaymentSettingsMessage("Could not read the QR image.");
        return;
      }

      setPaymentSettingsForm((previous) => ({
        ...previous,
        qr_code_url: base64
      }));
      setPaymentSettingsMessage("");
    };

    reader.onerror = () => {
      setPaymentSettingsMessage("Could not read the QR image.");
    };

    reader.readAsDataURL(file);
  };

  const createListing = async (e) => {
    e.preventDefault();
    setListingSubmitting(true);
    try {
      if (editingListingId) {
        await api(`/listings/${editingListingId}`, {
          method: "PUT",
          body: JSON.stringify(listingForm)
        });
      } else {
        await api("/listings", {
          method: "POST",
          body: JSON.stringify(listingForm)
        });
      }

      closeListingForm();
      await loadListings();
    } catch (error) {
      alert(error.message);
    } finally {
      setListingSubmitting(false);
    }
  };

  const openBuyModal = async (listing, initialQuantity = "") => {
    setBuyListing(listing);
    setBuyQuantity(initialQuantity ? String(initialQuantity) : "");
    setPaymentMethod("");
    setPaymentDetails(null);
    setTransactionId("");
    setBuyError("");
    setBuySuccess("");
    setDeliveryMethod("farmer_delivery");
    setDeliveryForm({
      address: "",
      city: "",
      pincode: "",
      phone: user?.phone || ""
    });
  };

  const closeBuyModal = () => {
    if (buySubmitting) return;
    setBuyListing(null);
    setPaymentDetails(null);
  };

  const selectPaymentMethod = async (method) => {
    setPaymentMethod(method);
    setBuyError("");
    setPaymentDetails(null);
    if (method === "offline") return;
    setPaymentLoading(true);
    try {
      const data = await api(`/listings/${buyListing.id}/payment-details`);
      setPaymentDetails(data);
    } catch (error) {
      setBuyError(error.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const placeOrder = async (e) => {
    e.preventDefault();
    setBuyError("");
    setBuySuccess("");

    if (!buyQuantity || Number(buyQuantity) <= 0) {
      setBuyError("Enter a valid quantity.");
      return;
    }

    if (!paymentMethod) {
      setBuyError("Select a payment method.");
      return;
    }

    if (paymentMethod !== "offline" && !transactionId.trim()) {
      setBuyError("Enter the transaction ID after making the payment.");
      return;
    }

    if (deliveryMethod !== "buyer_pickup") {
      if (
        !deliveryForm.address.trim() ||
        !deliveryForm.city.trim() ||
        !deliveryForm.pincode.trim() ||
        !deliveryForm.phone.trim()
      ) {
        setBuyError("Enter complete delivery address, city, pincode and phone.");
        return;
      }

      if (!/^\d{6}$/.test(deliveryForm.pincode.trim())) {
        setBuyError("Enter a valid 6-digit pincode.");
        return;
      }
    }

    setBuySubmitting(true);

    try {
      const data = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          listing_id: buyListing.id,
          quantity: Number(buyQuantity),
          payment_method: paymentMethod,
          transaction_id: transactionId.trim() || null
        })
      });

      const orderId = data?.order?.id ?? data?.id ?? data?.order_id;

      if (!orderId) {
        throw new Error(
          "Order was created, but its ID was not returned by the server."
        );
      }

      const deliveryPayload =
        deliveryMethod === "buyer_pickup"
          ? { delivery_method: "buyer_pickup" }
          : {
              delivery_method: deliveryMethod,
              delivery_address: deliveryForm.address.trim(),
              delivery_city: deliveryForm.city.trim(),
              delivery_pincode: deliveryForm.pincode.trim(),
              delivery_phone: deliveryForm.phone.trim()
            };

      await api(`/orders/${orderId}/delivery`, {
        method: "PATCH",
        body: JSON.stringify(deliveryPayload)
      });

      setBuySuccess(data.message || "Order placed successfully.");
      await Promise.all([loadListings(), loadOrders()]);
      setTimeout(closeBuyModal, 1300);
    } catch (error) {
      setBuyError(error.message);
    } finally {
      setBuySubmitting(false);
    }
  };

  const updateOrderStatus = async (id, status) => {
    try {
      await api(`/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await loadFarmerOrders();
      await loadOrders();
    } catch (error) {
      alert(error.message);
    }
  };

  const verifyPayment = async (id, action) => {
    try {
      await api(`/orders/${id}/payment/verify`, {
        method: "PATCH",
        body: JSON.stringify({ action })
      });
      await loadFarmerOrders();
      await loadOrders();
    } catch (error) {
      alert(error.message);
    }
  };

  const savePaymentSettings = async (e) => {
    e.preventDefault();
    setPaymentSettingsMessage("");
    try {
      const data = await api("/payment-details", {
        method: "POST",
        body: JSON.stringify(paymentSettingsForm)
      });
      setPaymentSettings(data.details);
      setPaymentSettingsMessage("Payment details saved successfully.");
    } catch (error) {
      setPaymentSettingsMessage(error.message);
    }
  };

  const handleMatchChange = (e) => {
    const { name, value } = e.target;
    setMatchForm((previous) => ({ ...previous, [name]: value }));
    setMatchError("");
  };

  const buildCombinedOrder = () => {
    const required = Number(matchForm.quantity);

    if (!Number.isFinite(required) || required <= 0 || matches.length === 0) {
      setCombinedPlan([]);
      setCombinedMessage("");
      return;
    }

    let remaining = required;
    const plan = [];

    for (const match of matches) {
      if (remaining <= 0) break;

      const available = Number(match.quantity);
      if (!Number.isFinite(available) || available <= 0) continue;

      const take = Math.min(remaining, available);
      const price = Number(match.price_per_unit || 0);

      plan.push({
        ...match,
        selected_quantity: Number(take.toFixed(2)),
        subtotal: Number((take * price).toFixed(2))
      });

      remaining -= take;
    }

    setCombinedPlan(plan);

    if (remaining <= 0.00001) {
      setCombinedMessage(
        `Requirement covered: ${required} kg from ${plan.length} farmer${plan.length !== 1 ? "s" : ""}.`
      );
    } else {
      setCombinedMessage(
        `Only ${Number((required - remaining).toFixed(2))} kg is available. ${Number(remaining.toFixed(2))} kg is still needed.`
      );
    }
  };

  const findMatchingFarmers = async (e) => {
    e?.preventDefault();
    setMatchError("");
    setMatches([]);
    setCombinedPlan([]);
    setCombinedMessage("");
    setMatchSearched(false);

    const crop = matchForm.crop_name.trim();
    const quantity = Number(matchForm.quantity);
    const location = matchForm.location.trim();
    const maxPrice =
      matchForm.max_price === "" ? null : Number(matchForm.max_price);

    if (!crop) {
      setMatchError("Enter the crop name.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMatchError("Enter a valid required quantity.");
      return;
    }

    if (
      maxPrice !== null &&
      (!Number.isFinite(maxPrice) || maxPrice < 0)
    ) {
      setMatchError("Enter a valid maximum price.");
      return;
    }

    setMatchLoading(true);

    try {
      const params = new URLSearchParams({
        crop_name: crop,
        quantity: String(quantity)
      });

      if (location) params.set("location", location);
      if (maxPrice !== null) params.set("max_price", String(maxPrice));

      const data = await api(`/ai/matches?${params.toString()}`);
      const foundMatches = Array.isArray(data?.matches) ? data.matches : [];
      setMatches(foundMatches);
      setMatchSearched(true);

      // Automatically build the multi-farmer split as soon as matches are found.
      if (foundMatches.length > 0) {
        let remaining = quantity;
        const plan = [];

        for (const match of foundMatches) {
          if (remaining <= 0) break;

          const available = Number(match.quantity);
          if (!Number.isFinite(available) || available <= 0) continue;

          const take = Math.min(remaining, available);
          const price = Number(match.price_per_unit || 0);

          plan.push({
            ...match,
            selected_quantity: Number(take.toFixed(2)),
            subtotal: Number((take * price).toFixed(2))
          });

          remaining -= take;
        }

        setCombinedPlan(plan);

        if (remaining <= 0.00001) {
          setCombinedMessage(
            `Requirement covered: ${quantity} kg from ${plan.length} farmer${plan.length !== 1 ? "s" : ""}.`
          );
        } else {
          setCombinedMessage(
            `Only ${Number((quantity - remaining).toFixed(2))} kg is available. ${Number(remaining.toFixed(2))} kg is still needed.`
          );
        }
      }
    } catch (error) {
      console.error("Producer matching error:", error);
      setMatchError(
        error.message || "Unable to find matching farmers."
      );
    } finally {
      setMatchLoading(false);
    }
  };

  const clearMatches = () => {
    setMatchForm({
      crop_name: "",
      quantity: "",
      location: "",
      max_price: ""
    });
    setMatches([]);
    setCombinedPlan([]);
    setCombinedMessage("");
    setMatchError("");
    setMatchSearched(false);
  };

  
  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      if (l.status !== "available" || Number(l.quantity) <= 0) return false;
      if (!q) return true;
      return [l.crop_name, l.farmer_name, l.location]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [listings, search]);

  if (!user) {
    return (
      <div className="app">
        <header className="navbar">
          <img src={agroLogo} alt="AGro" className="brand-logo" />
          <div className="nav-badge">Farm to Market</div>
        </header>
        <main className="hero">
          <section className="hero-content">
            <div className="eyebrow">DIRECT FARM MARKETPLACE</div>
            <h2>Connect farms.<br /><span>Grow together.</span></h2>
            <p>AGro connects farmers directly with buyers, helping produce reach the market with fewer middlemen.</p>
            <div className="benefits">
              <div className="benefit"><strong>🌾</strong><span>Direct selling</span></div>
              <div className="benefit"><strong>🛒</strong><span>Direct buying</span></div>
              <div className="benefit"><strong>💰</strong><span>Fairer trade</span></div>
            </div>
          </section>
          <section className="auth-card">
            <div className="auth-tabs">
              <button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Login</button>
              <button className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>Create Account</button>
            </div>
            <form onSubmit={submitAuth}>
              {authMode === "signup" && <>
                <div className="form-group"><label>Name</label><input name="name" value={authForm.name} onChange={handleAuthChange} required /></div>
                <div className="form-group"><label>Phone</label><input name="phone" value={authForm.phone} onChange={handleAuthChange} /></div>
                <div className="form-group"><label>Account type</label><select name="role" value={authForm.role} onChange={handleAuthChange}><option value="buyer">Buyer</option><option value="farmer">Farmer</option></select></div>
              </>}
              <div className="form-group"><label>Email</label><input type="email" name="email" value={authForm.email} onChange={handleAuthChange} required /></div>
              <div className="form-group"><label>Password</label><input type="password" name="password" value={authForm.password} onChange={handleAuthChange} required /></div>
              {authError && <div className="modal-error">{authError}</div>}
              <button className="primary-action" disabled={authLoading}>{authLoading ? "Please wait..." : authMode === "login" ? "Login" : "Create Account"}</button>
            </form>
          </section>
        </main>
      </div>
    );
  }

  const totalSpent = orders.reduce((s, o) => s + Number(o.total_price || 0), 0);
  const pendingOrders = orders.filter((o) => o.status === "pending");

  return (
    <div className="dashboard-app">
      <div className="dashboard-shell">
        <aside className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-brand">
            <img src={agroLogo} alt="AGro" />
            <span>Direct Farm Marketplace</span>
          </div>
          <nav className="sidebar-nav">
            <button className="sidebar-link active" onClick={() => { setSidebarOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}><span>⌂</span>Dashboard</button>
            <button className="sidebar-link" onClick={() => { setSidebarOpen(false); document.getElementById("marketplace")?.scrollIntoView({ behavior: "smooth" }); }}><span>🛒</span>Marketplace</button>
            {user.role === "farmer" && <button className="sidebar-link" onClick={() => { setSidebarOpen(false); document.getElementById("my-listings")?.scrollIntoView({ behavior: "smooth" }); }}><span>🌾</span>My Listings</button>}
            <button className="sidebar-link" onClick={() => { setSidebarOpen(false); document.getElementById("my-purchases")?.scrollIntoView({ behavior: "smooth" }); }}><span>📦</span>My Purchases</button>
            {user.role === "farmer" && <button className="sidebar-link" onClick={() => { setSidebarOpen(false); document.getElementById("buyer-orders")?.scrollIntoView({ behavior: "smooth" }); }}><span>🤝</span>Buyer Orders</button>}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-tip"><span>🌱</span><div><strong>Grow smarter</strong><small>Sell directly and reach more buyers.</small></div></div>
          </div>
        </aside>

        {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}

        <div className="dashboard-main">
          <header className="dashboard-navbar">
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Open menu"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
        >
          ☰
        </button>
        <img src={agroLogo} alt="AGro" className="dashboard-logo" />
        <div className="dashboard-user">
          <div className="user-avatar">{user.name?.charAt(0).toUpperCase()}</div>
          <div className="user-info"><strong>{user.name}</strong><span>{user.role === "farmer" ? "Farmer" : "Buyer"}</span></div>
          {user.role === "farmer" && <button className="text-button" onClick={() => setShowPaymentSettings(true)}>Payment Settings</button>}
          <button className="logout-button" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="dashboard-container">
        <section className="dashboard-welcome">
          <div>
            <p className="dashboard-label">{user.role === "farmer" ? "FARMER DASHBOARD" : "BUYER DASHBOARD"}</p>
            <h1>Welcome, {user.name?.split(" ")[0]} 👋</h1>
            <p>{user.role === "farmer" ? "Sell your produce and buy crops from other farmers." : "Buy fresh produce directly from farmers."}</p>
          </div>
          {user.role === "farmer" && <button className="primary-action" onClick={openListingForm}>+ Add Listing</button>}
        </section>

        {(listingsError || ordersError) && <div className="dashboard-error">{listingsError || ordersError}</div>}

        <section className="stats-grid">
          <div className="stat-card"><div className="stat-icon">🌾</div><div><span>Available Crops</span><strong>{filteredListings.length}</strong></div></div>
          <div className="stat-card"><div className="stat-icon">📦</div><div><span>My Orders</span><strong>{orders.length}</strong></div></div>
          <div className="stat-card"><div className="stat-icon">⏳</div><div><span>Pending</span><strong>{pendingOrders.length}</strong></div></div>
          <div className="stat-card"><div className="stat-icon">💰</div><div><span>Total Spent</span><strong>₹{totalSpent.toFixed(2)}</strong></div></div>
        </section>

        {user.role === "farmer" && (
          <section className="dashboard-panel" id="my-listings">
            <div className="panel-header">
              <div><h2>My Listings</h2><p>Your produce currently available for buyers.</p></div>
              <button className="text-button" onClick={loadListings}>Refresh</button>
            </div>
            <div className="listing-grid">
              {listings.filter(l => Number(l.farmer_id) === Number(user.id)).map(l => (
                <div className="listing-card" key={l.id}>
                  <div className="listing-top"><span>🌾</span><span className={`status-badge ${l.status}`}>{l.status}</span></div>
                  <h3>{l.crop_name}</h3>
                  <p>{l.quantity} {l.unit} · ₹{l.price_per_unit}/{l.unit}</p>
                  {l.location && <small>📍 {l.location}</small>}
                
                   <div className="listing-card-actions">
                     <button type="button" className="text-button" onClick={() => openEditListing(l)}>Edit</button>
                     <button type="button" className="cancel-order-button" onClick={() => deleteListing(l.id)}>Delete</button>
                   </div>
                 </div>
              ))}
            </div>
          </section>
        )}

        {user.role === "buyer" && (
          <section className="dashboard-panel" id="producer-matching">
            <div className="panel-header">
              <div>
                <p className="dashboard-label">SMART BUYING</p>
                <h2>Find Matching Farmers</h2>
                <p>Enter your requirement and find farmers with suitable produce.</p>
              </div>
              {matchSearched && (
                <button className="text-button" type="button" onClick={clearMatches}>
                  Clear
                </button>
              )}
            </div>

            <form onSubmit={findMatchingFarmers}>
              <div className="form-row">
                <div className="form-group">
                  <label>Crop *</label>
                  <input name="crop_name" value={matchForm.crop_name} onChange={handleMatchChange} placeholder="e.g. Tomato" required />
                </div>
                <div className="form-group">
                  <label>Required quantity (kg) *</label>
                  <input type="number" name="quantity" min="0.01" step="0.01" value={matchForm.quantity} onChange={handleMatchChange} placeholder="e.g. 300" required />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Preferred location</label>
                  <input name="location" value={matchForm.location} onChange={handleMatchChange} placeholder="e.g. Vadodara" />
                </div>
                <div className="form-group">
                  <label>Maximum price (₹/kg)</label>
                  <input type="number" name="max_price" min="0" step="0.01" value={matchForm.max_price} onChange={handleMatchChange} placeholder="Optional" />
                </div>
              </div>

              {matchError && <div className="modal-error">{matchError}</div>}

              <div className="modal-actions">
                <button type="button" className="cancel-button" onClick={clearMatches} disabled={matchLoading}>Reset</button>
                <button className="primary-action" disabled={matchLoading}>
                  {matchLoading ? "Finding farmers..." : "🔎 Find Farmers"}
                </button>
              </div>
            </form>

            {matchSearched && (
              <div style={{ marginTop: "20px" }}>
                {matches.length === 0 ? (
                  <div className="empty-state compact">
                    <div className="empty-icon">🌱</div>
                    <h3>No suitable farmers found</h3>
                    <p>Try another crop, location, quantity, or maximum price.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                      <strong style={{ color: "#294934" }}>{matches.length} matching farmer{matches.length !== 1 ? "s" : ""}</strong>
                      <span style={{ fontSize: "13px", color: "#718074" }}>Ranked by crop, quantity, price and location</span>
                    </div>

                    <div style={{ marginBottom: "18px", padding: "16px", border: "1px solid #dce9df", borderRadius: "16px", background: "#f7fbf7" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                        <div>
                          <strong style={{ color: "#294934", fontSize: "17px" }}>🧩 Combine Multiple Farmers</strong>
                          <p style={{ margin: "5px 0 0", color: "#718074", fontSize: "13px" }}>Automatically split your requirement across the best available farmers.</p>
                        </div>
                        <button type="button" className="primary-action" onClick={buildCombinedOrder}>Build My Combined Order</button>
                      </div>

                      {combinedMessage && (
                        <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: combinedPlan.reduce((s, p) => s + Number(p.selected_quantity || 0), 0) >= Number(matchForm.quantity) ? "#edf8ef" : "#fff8e8", color: "#41684a", fontSize: "13px", fontWeight: 700 }}>
                          {combinedMessage}
                        </div>
                      )}

                      {combinedPlan.length > 0 && (
                        <div style={{ marginTop: "14px" }}>
                          {combinedPlan.map((plan, index) => (
                            <div key={`${plan.listing_id ?? plan.id}-${index}`} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "10px", alignItems: "center", padding: "11px 0", borderTop: "1px solid #e5eee7" }}>
                              <div>
                                <strong style={{ color: "#294934" }}>{plan.farmer_name || "Farmer"}</strong>
                                <div style={{ fontSize: "12px", color: "#718074" }}>{plan.location || "Location not provided"}</div>
                              </div>
                              <div><small style={{ color: "#718074" }}>Take</small><strong style={{ display: "block", color: "#294934" }}>{plan.selected_quantity} kg</strong></div>
                              <div><small style={{ color: "#718074" }}>Rate</small><strong style={{ display: "block", color: "#294934" }}>₹{Number(plan.price_per_unit || 0).toFixed(2)}/kg</strong></div>
                              <div><small style={{ color: "#718074" }}>Subtotal</small><strong style={{ display: "block", color: "#294934" }}>₹{Number(plan.subtotal || 0).toFixed(2)}</strong></div>
                            </div>
                          ))}

                          <div style={{ marginTop: "10px", paddingTop: "12px", borderTop: "1px solid #dce9df", display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                            <strong style={{ color: "#294934" }}>Total planned quantity: {combinedPlan.reduce((s, p) => s + Number(p.selected_quantity || 0), 0).toFixed(2)} kg</strong>
                            <strong style={{ color: "#294934" }}>Total: ₹{combinedPlan.reduce((s, p) => s + Number(p.subtotal || 0), 0).toFixed(2)}</strong>
                          </div>

                          <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {combinedPlan.map((plan, index) => {
                              const listingId = plan.listing_id ?? plan.id;
                              const listing = listings.find((l) => Number(l.id) === Number(listingId));
                              return (
                                <button key={`buy-plan-${listingId}-${index}`} type="button" className="buy-button" style={{ flex: "1 1 180px" }} disabled={!listing} onClick={() => listing ? openBuyModal(listing, plan.selected_quantity) : alert("This listing is no longer available. Refresh the marketplace.")}>
                                  {listing ? `Buy ${plan.selected_quantity} kg from ${plan.farmer_name || "Farmer"}` : "Listing Unavailable"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="marketplace-grid">
                      {matches.map((match) => {
                        const listingId = match.listing_id ?? match.id;
                        const matchingListing = listings.find((l) => Number(l.id) === Number(listingId));
                        return (
                          <div className="marketplace-card" key={listingId}>
                            <div className="marketplace-card-top"><div className="large-crop-icon">🌾</div><span className="available-badge">{Number(match.match_score || 0)}% Match</span></div>
                            <h3>{match.crop_name || matchForm.crop_name}</h3>
                            <p className="farmer-name">👨‍🌾 {match.farmer_name || "Farmer"}</p>
                            <div className="marketplace-info">
                              <div><span>Price</span><strong>₹{Number(match.price_per_unit || 0).toFixed(2)}<small>/{match.unit || "kg"}</small></strong></div>
                              <div><span>Available</span><strong>{match.quantity} {match.unit || "kg"}</strong></div>
                            </div>
                            {match.location && <p className="listing-location">📍 {match.location}</p>}
                            {Array.isArray(match.match_reasons) && match.match_reasons.length > 0 && (
                              <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {match.match_reasons.map((reason, index) => <span key={index} style={{ fontSize: "11px", padding: "5px 8px", borderRadius: "999px", background: "#f1f7f2", color: "#41684a", fontWeight: 700 }}>✓ {reason}</span>)}
                              </div>
                            )}
                            <button className="buy-button" disabled={!matchingListing} onClick={() => matchingListing ? openBuyModal(matchingListing) : alert("This listing is no longer available. Refresh the marketplace.")}>
                              {matchingListing ? "Buy From This Farmer" : "Listing Unavailable"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        <section className="dashboard-panel marketplace-panel" id="marketplace">
          <div className="marketplace-header">
            <div><p className="dashboard-label">DIRECT FARM MARKETPLACE</p><h2>Fresh produce from farmers</h2><p>Browse available crops and buy directly from the farmer.</p></div>
            <button className="text-button" onClick={loadListings}>Refresh</button>
          </div>
          <div className="search-box"><span>🔎</span><input placeholder="Search crops, farmers or locations..." value={search} onChange={e => setSearch(e.target.value)} /></div>
          {listingsLoading ? <div className="loading-state"><p>Loading marketplace...</p></div> : filteredListings.length === 0 ? <div className="empty-state"><div className="empty-icon">🌱</div><h3>No crops available</h3><p>Farmers haven't listed available produce yet.</p></div> :
            <div className="marketplace-grid">{filteredListings.map(l => (
              <div className="marketplace-card" key={l.id}>
                <div className="marketplace-card-top"><div className="large-crop-icon">🌾</div><span className="available-badge">Available</span></div>
                <h3>{l.crop_name}</h3><p className="farmer-name">👨‍🌾 {l.farmer_name}</p>
                <div className="marketplace-info"><div><span>Price</span><strong>₹{l.price_per_unit}<small>/{l.unit}</small></strong></div><div><span>Available</span><strong>{l.quantity} {l.unit}</strong></div></div>
                {l.location && <p className="listing-location">📍 {l.location}</p>}
                {l.description && <p className="listing-description">{l.description}</p>}
                <button className="buy-button" onClick={() => openBuyModal(l)}>Buy Now</button>
              </div>
            ))}</div>}
        </section>

        <section className="dashboard-panel" id="my-purchases">
          <div className="panel-header">
            <div><h2>My Purchases</h2><p>Track your orders, payments and delivery status.</p></div>
            <button className="text-button" onClick={loadOrders}>Refresh</button>
          </div>
          {orders.length === 0 ? <div className="empty-state compact"><div className="empty-icon">🛒</div><h3>No purchases yet</h3><p>Your purchases will appear here.</p></div> :
            <div className="orders-list">{orders.map(o => {
              const delivery = deliveryDetails[o.id] || o;
              const deliveryStatus = delivery.delivery_status || o.delivery_status || "pending";
              const canConfirmDelivered = (o.status === "confirmed" || o.status === "completed") && deliveryStatus === "in_transit";
              const canConfirmPickup = (o.status === "confirmed" || o.status === "completed") && o.delivery_method === "buyer_pickup" && deliveryStatus === "ready_for_pickup";
              const canConfirmPickupDelivery = (o.status === "confirmed" || o.status === "completed") && o.delivery_method === "buyer_pickup" && deliveryStatus === "picked_up";
              return (
                <div className="order-card" key={o.id}>
                  <div className="order-main"><div className="order-icon">🌾</div><div><h3>{o.crop_name}</h3><p>Order #{o.id}</p></div></div>
                  <div className="order-detail"><span>Quantity</span><strong>{o.quantity} {o.unit}</strong></div>
                  <div className="order-detail"><span>Total</span><strong>₹{Number(o.total_price).toFixed(2)}</strong></div>
                  <div className="order-detail"><span>Order</span><span className={`order-status ${o.status}`}>{o.status}</span></div>
                  <div className="order-detail"><span>Payment</span><span className={`payment-status ${o.payment_status || "pending"}`}>{(o.payment_status || "pending").replace("_", " ")}</span></div>
                  {o.delivery_method && (
                    <>
                      <div className="order-detail"><span>Delivery</span><strong>{String(o.delivery_method).replaceAll("_", " ")}</strong></div>
                      <div className="order-detail"><span>Delivery Status</span><strong>{deliveryStatusLabel(deliveryStatus)}</strong></div>
                      {o.delivery_address && <div className="order-detail"><span>Address</span><strong>{o.delivery_address}{o.delivery_city ? `, ${o.delivery_city}` : ""}{o.delivery_pincode && o.delivery_pincode !== "N/A" ? ` - ${o.delivery_pincode}` : ""}</strong></div>}
                    </>
                  )}
                  {(canConfirmPickup || canConfirmPickupDelivery || canConfirmDelivered) && (
                    <div className="farmer-order-actions">
                      {canConfirmPickup && <button className="confirm-button" disabled={deliveryLoading[o.id]} onClick={() => updateDeliveryStatus(o.id, "picked_up")}>{deliveryLoading[o.id] ? "Updating..." : "Confirm Pickup"}</button>}
                      {canConfirmPickupDelivery && <button className="confirm-button" disabled={deliveryLoading[o.id]} onClick={() => updateDeliveryStatus(o.id, "delivered")}>{deliveryLoading[o.id] ? "Updating..." : "Confirm Received"}</button>}
                      {canConfirmDelivered && <button className="confirm-button" disabled={deliveryLoading[o.id]} onClick={() => updateDeliveryStatus(o.id, "delivered")}>{deliveryLoading[o.id] ? "Updating..." : "Confirm Delivered"}</button>}
                    </div>
                  )}
                  {deliveryError[o.id] && <div className="modal-error">{deliveryError[o.id]}</div>}
                </div>
              );
            })}</div>}
        </section>

        {user.role === "farmer" && (
          <section className="dashboard-panel" id="buyer-orders">
            <div className="panel-header"><div><h2>Orders From Buyers</h2><p>Verify payments and manage your sales.</p></div><button className="text-button" onClick={loadFarmerOrders}>Refresh</button></div>
            {farmerOrders.length === 0 ? <div className="empty-state compact"><div className="empty-icon">📦</div><h3>No sales yet</h3><p>Orders from buyers will appear here.</p></div> :
              <div className="farmer-orders-list">{farmerOrders.map(o => (
                <div className="farmer-order-card" key={o.id}>
                  <div className="farmer-order-header"><div><h3>{o.crop_name}</h3><p>Buyer: {o.buyer_name}</p></div><span className={`order-status ${o.status}`}>{o.status}</span></div>
                  <div className="farmer-order-details">
                    <div><span>Quantity</span><strong>{o.quantity} {o.unit}</strong></div>
                    <div><span>Total</span><strong>₹{Number(o.total_price).toFixed(2)}</strong></div>
                    <div><span>Payment</span><strong className={`payment-status ${o.payment_status}`}>{o.payment_status}</strong></div>
                    <div><span>Method</span><strong>{o.payment_method || "—"}</strong></div>
                    <div><span>Transaction</span><strong>{o.transaction_id || "—"}</strong></div>
                    <div><span>Delivery</span><strong>{o.delivery_method ? String(o.delivery_method).replaceAll("_", " ") : "—"}</strong></div>
                    <div><span>Delivery Status</span><strong>{o.delivery_status ? String(o.delivery_status).replaceAll("_", " ") : "—"}</strong></div>
                    {o.delivery_method && o.delivery_method !== "buyer_pickup" && o.delivery_address && (
                      <div className="farmer-order-address">
                        <span>Buyer Address</span>
                        <strong>{o.delivery_address}{o.delivery_city ? `, ${o.delivery_city}` : ""}{o.delivery_pincode ? ` - ${o.delivery_pincode}` : ""}</strong>
                      </div>
                    )}
                  </div>
                  {(() => {
                    const delivery = deliveryDetails[o.id] || o;
                    const deliveryStatus = delivery.delivery_status || o.delivery_status || "pending";
                    const nextDelivery = getNextDeliveryStatus(o, deliveryStatus);
                    return (o.status === "confirmed" || o.status === "completed") && nextDelivery ? (
                      <div className="farmer-order-actions">
                        <button className="confirm-button" disabled={deliveryLoading[o.id]} onClick={() => updateDeliveryStatus(o.id, nextDelivery)}>
                          {deliveryLoading[o.id] ? "Updating..." : `Mark ${deliveryStatusLabel(nextDelivery)}`}
                        </button>
                      </div>
                    ) : null;
                  })()}
                  <div className="farmer-order-actions">
                    {(o.payment_status === "submitted" || o.payment_status === "pending") && <>
                      <button className="confirm-button" onClick={() => verifyPayment(o.id, "verify")}>Verify Payment</button>
                      <button className="cancel-order-button" onClick={() => verifyPayment(o.id, "reject")}>Reject Payment</button>
                    </>}
                    {o.status === "pending" && o.payment_status === "verified" && <button className="confirm-button" onClick={() => updateOrderStatus(o.id, "confirmed")}>Confirm Order</button>}
                    {o.status === "confirmed" && (o.delivery_status === "delivered" || deliveryDetails[o.id]?.delivery_status === "delivered") && <button className="complete-button" onClick={() => updateOrderStatus(o.id, "completed")}>Mark Completed</button>}
                    {o.status === "pending" && <button className="cancel-order-button" onClick={() => updateOrderStatus(o.id, "cancelled")}>Cancel Order</button>}
                  </div>
                  {deliveryError[o.id] && <div className="modal-error">{deliveryError[o.id]}</div>}
                </div>
              ))}</div>}
          </section>
        )}

        <section className="quick-actions"><h2>Quick Actions</h2><div className="quick-grid">
          {user.role === "farmer" && <button className="quick-card" onClick={openListingForm}><span>🌾</span><div><strong>Add Crop Listing</strong><small>Sell your fresh produce</small></div></button>}
          <button className="quick-card" onClick={() => document.getElementById("marketplace")?.scrollIntoView({ behavior: "smooth" })}><span>🛒</span><div><strong>Buy Produce</strong><small>Purchase from other farmers</small></div></button>
          <button className="quick-card" onClick={async () => {
            setSidebarOpen(false);
            const targetId = user.role === "farmer" ? "buyer-orders" : "my-purchases";
            document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
            if (user.role === "farmer") {
              await loadFarmerOrders();
            } else {
              await loadOrders();
            }
          }}><span>📦</span><div><strong>Manage Orders</strong><small>Track your marketplace activity</small></div></button>
        </div></section>
      </main>

          <footer className="dashboard-footer"><span>© 2026 AGro</span><span>Direct Farm Marketplace</span></footer>
        </div>
      </div>

      {showListingForm && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeListingForm()}>
          <div className="listing-modal"><div className="modal-header"><div><p className="dashboard-label">FARMER MARKETPLACE</p><h2>{editingListingId ? "Edit Crop Listing" : "Add Crop Listing"}</h2><p>Tell buyers what produce you have available.</p></div><button className="modal-close" onClick={closeListingForm}>×</button></div>
            <form onSubmit={createListing}>
              <div className="form-row"><div className="form-group"><label>Crop name *</label><input name="crop_name" value={listingForm.crop_name} onChange={handleListingChange} required /></div><div className="form-group"><label>Quantity *</label><input type="number" name="quantity" min="0.01" step="0.01" value={listingForm.quantity} onChange={handleListingChange} required /></div></div>
              <div className="form-row"><div className="form-group"><label>Unit *</label><select name="unit" value={listingForm.unit} onChange={handleListingChange}><option>kg</option><option>quintal</option><option>ton</option><option>litre</option><option>piece</option></select></div><div className="form-group"><label>Price per unit *</label><input type="number" name="price_per_unit" min="0" step="0.01" value={listingForm.price_per_unit} onChange={handleListingChange} required /></div></div>

              {/* AI PRICE SUGGESTION */}
              <div
                style={{
                  margin: "18px 0 20px",
                  padding: "18px",
                  border: "1px solid #dce9df",
                  borderRadius: "18px",
                  background: "linear-gradient(180deg, #f8fcf8 0%, #f2f8f3 100%)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ flex: "1 1 260px" }}>
                    <div
                      style={{
                        fontSize: "17px",
                        fontWeight: 800,
                        color: "#294934",
                        marginBottom: "5px"
                      }}
                    >
                      🤖 AI Price Suggestion
                    </div>

                    <div
                      style={{
                        fontSize: "13px",
                        lineHeight: 1.5,
                        color: "#6d7f72"
                      }}
                    >
                      Market-aware estimate using available market signals,
                      Government MSP and season.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={getAiPriceRecommendation}
                    disabled={aiPriceLoading}
                    style={{
                      border: 0,
                      borderRadius: "10px",
                      padding: "10px 16px",
                      background: aiPriceLoading ? "#9ab5a0" : "#4f8b5b",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: aiPriceLoading ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {aiPriceLoading ? "Calculating..." : "Suggest Price"}
                  </button>
                </div>

                {aiPriceError && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: "#fff1f0",
                      color: "#a13b35",
                      fontSize: "13px",
                      fontWeight: 600
                    }}
                  >
                    {aiPriceError}
                  </div>
                )}

                {aiPriceResult && (
                  <div style={{ marginTop: "16px" }}>
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: "14px",
                        padding: "16px",
                        border: "1px solid #e3ebe5"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                          flexWrap: "wrap"
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "11px",
                              letterSpacing: "0.08em",
                              fontWeight: 800,
                              color: "#718074",
                              marginBottom: "4px"
                            }}
                          >
                            RECOMMENDED SELLING PRICE
                          </div>

                          <div
                            style={{
                              fontSize: "30px",
                              lineHeight: 1.1,
                              fontWeight: 900,
                              color: "#294934"
                            }}
                          >
                            ₹{aiPriceResult.suggested_price.toFixed(2)}
                            <span
                              style={{
                                fontSize: "14px",
                                fontWeight: 700,
                                color: "#718074",
                                marginLeft: "4px"
                              }}
                            >
                              /{listingForm.unit}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={useAiPrice}
                          style={{
                            border: 0,
                            borderRadius: "10px",
                            padding: "10px 14px",
                            background: "#294934",
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer"
                          }}
                        >
                          Use this price
                        </button>
                      </div>

                      <div
                        style={{
                          marginTop: "14px",
                          paddingTop: "14px",
                          borderTop: "1px solid #edf1ee",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap"
                        }}
                      >
                        <span style={{ fontSize: "13px", color: "#718074" }}>
                          Suggested range
                        </span>

                        <strong style={{ fontSize: "14px", color: "#294934" }}>
                          ₹{aiPriceResult.minimum_price.toFixed(2)}
                          {" – "}
                          ₹{aiPriceResult.maximum_price.toFixed(2)}
                          /{listingForm.unit}
                        </strong>
                      </div>

                      <div
                        style={{
                          marginTop: "12px",
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                          gap: "8px"
                        }}
                      >
                        {[
                          [
                            "MARKET",
                            aiPriceResult.market_price_per_kg !== null
                              ? `₹${aiPriceResult.market_price_per_kg.toFixed(2)}/kg`
                              : "Unavailable"
                          ],
                          [
                            "GOVT. MSP",
                            aiPriceResult.applicable_msp_per_kg !== null
                              ? `₹${aiPriceResult.applicable_msp_per_kg.toFixed(2)}/kg`
                              : "Not applicable"
                          ],
                          [
                            "SEASON",
                            aiPriceResult.season
                              ? aiPriceResult.season.charAt(0).toUpperCase() +
                                aiPriceResult.season.slice(1)
                              : "—"
                          ]
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            style={{
                              minWidth: 0,
                              padding: "10px",
                              borderRadius: "10px",
                              background: "#f5f8f5"
                            }}
                          >
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: 800,
                                color: "#7b897e",
                                marginBottom: "3px"
                              }}
                            >
                              {label}
                            </div>

                            <strong
                              style={{
                                fontSize: "13px",
                                color: "#294934",
                                wordBreak: "break-word"
                              }}
                            >
                              {value}
                            </strong>
                          </div>
                        ))}
                      </div>

                      <div
                        style={{
                          marginTop: "12px",
                          fontSize: "12px",
                          lineHeight: 1.45,
                          color: "#718074"
                        }}
                      >
                        ⓘ{" "}
                        {aiPriceResult.market_data_source
                          ? `Based on ${aiPriceResult.market_data_source}. `
                          : ""}
                        This is an AI-assisted recommendation, not a guaranteed
                        sale price. The farmer decides the final selling price.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* AI CROP QUALITY */}
              <div
                style={{
                  margin: "18px 0 20px",
                  padding: "18px",
                  border: "1px solid #dce9df",
                  borderRadius: "18px",
                  background: "linear-gradient(180deg, #f8fcf8 0%, #f2f8f3 100%)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ flex: "1 1 260px" }}>
                    <div
                      style={{
                        fontSize: "17px",
                        fontWeight: 800,
                        color: "#294934",
                        marginBottom: "5px"
                      }}
                    >
                      📷 AI Crop Quality Check
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        lineHeight: 1.5,
                        color: "#6d7f72"
                      }}
                    >
                      Upload a clear photo of your crop. AI will assess only
                      visible quality indicators.
                    </div>
                  </div>

                  <label
                    style={{
                      border: 0,
                      borderRadius: "10px",
                      padding: "10px 16px",
                      background: "#4f8b5b",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: "pointer",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {qualityPreview ? "Change Image" : "Upload Image"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleQualityImage}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>

                {qualityPreview && (
                  <div
                    style={{
                      marginTop: "14px",
                      display: "flex",
                      gap: "14px",
                      alignItems: "center",
                      flexWrap: "wrap"
                    }}
                  >
                    <img
                      src={qualityPreview}
                      alt="Selected crop"
                      style={{
                        width: "120px",
                        height: "90px",
                        objectFit: "cover",
                        borderRadius: "12px",
                        border: "1px solid #dce9df"
                      }}
                    />

                    <button
                      type="button"
                      onClick={analyzeCropQuality}
                      disabled={qualityLoading}
                      style={{
                        border: 0,
                        borderRadius: "10px",
                        padding: "10px 16px",
                        background: qualityLoading ? "#9ab5a0" : "#294934",
                        color: "#fff",
                        fontWeight: 800,
                        cursor: qualityLoading ? "not-allowed" : "pointer"
                      }}
                    >
                      {qualityLoading ? "Analyzing..." : "Analyze Crop Quality"}
                    </button>
                  </div>
                )}

                {qualityError && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: "#fff1f0",
                      color: "#a13b35",
                      fontSize: "13px",
                      fontWeight: 600
                    }}
                  >
                    {qualityError}
                  </div>
                )}

                {qualityResult && (
                  <div
                    style={{
                      marginTop: "14px",
                      background: "#fff",
                      borderRadius: "14px",
                      padding: "16px",
                      border: "1px solid #e3ebe5"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        flexWrap: "wrap"
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "11px",
                            letterSpacing: "0.08em",
                            fontWeight: 800,
                            color: "#718074",
                            marginBottom: "4px"
                          }}
                        >
                          AI QUALITY ASSESSMENT
                        </div>
                        <div
                          style={{
                            fontSize: "28px",
                            fontWeight: 900,
                            color: "#294934"
                          }}
                        >
                          Grade {String(qualityResult.grade).toUpperCase()}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: "26px",
                          fontWeight: 900,
                          color: "#4f8b5b"
                        }}
                      >
                        {qualityResult.score}/100
                      </div>
                    </div>

                    {qualityResult.summary && (
                      <p
                        style={{
                          margin: "12px 0 0",
                          fontSize: "13px",
                          lineHeight: 1.5,
                          color: "#53645a"
                        }}
                      >
                        {qualityResult.summary}
                      </p>
                    )}

                    {qualityResult.issues.length > 0 && (
                      <div style={{ marginTop: "12px" }}>
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            color: "#718074",
                            marginBottom: "5px"
                          }}
                        >
                          VISIBLE ISSUES
                        </div>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: "18px",
                            color: "#53645a",
                            fontSize: "13px",
                            lineHeight: 1.5
                          }}
                        >
                          {qualityResult.issues.map((issue, index) => (
                            <li key={index}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: "12px",
                        fontSize: "12px",
                        lineHeight: 1.45,
                        color: "#718074"
                      }}
                    >
                      ⓘ AI assessment is based only on the uploaded image.
                      It is an aid, not a certified agricultural quality
                      inspection.
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group"><label>Location</label><input name="location" value={listingForm.location} onChange={handleListingChange} placeholder="e.g. Vadodara, Gujarat" /></div>
              <div className="form-group"><label>Description</label><textarea name="description" value={listingForm.description} onChange={handleListingChange} /></div>
              <div className="modal-actions"><button type="button" className="cancel-button" onClick={closeListingForm}>Cancel</button><button className="primary-action" disabled={listingSubmitting}>{listingSubmitting ? (editingListingId ? "Saving..." : "Creating...") : (editingListingId ? "Save Changes" : "Create Listing")}</button></div>
            </form>
          </div>
        </div>
      )}

      {buyListing && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeBuyModal()}>
          <div className="buy-modal">
            <div className="modal-header"><div><p className="dashboard-label">SECURE MANUAL PAYMENT</p><h2>Buy {buyListing.crop_name}</h2><p>From {buyListing.farmer_name}</p></div><button className="modal-close" onClick={closeBuyModal}>×</button></div>
            <div className="buy-summary"><div><span>Price</span><strong>₹{buyListing.price_per_unit}/{buyListing.unit}</strong></div><div><span>Available</span><strong>{buyListing.quantity} {buyListing.unit}</strong></div></div>
            <form onSubmit={placeOrder}>
              <div className="form-group"><label>Quantity ({buyListing.unit}) *</label><input type="number" min="0.01" max={buyListing.quantity} step="0.01" value={buyQuantity} onChange={e => setBuyQuantity(e.target.value)} required /></div>
              {buyQuantity && Number(buyQuantity) > 0 && <div className="total-preview"><span>Order Total</span><strong>₹{(Number(buyQuantity) * Number(buyListing.price_per_unit)).toFixed(2)}</strong></div>}
              <div className="payment-methods"><label>Payment method *</label>
                <button type="button" className={paymentMethod === "upi" ? "payment-option selected" : "payment-option"} onClick={() => selectPaymentMethod("upi")}><span>📱</span><div><strong>UPI / QR</strong><small>Pay using UPI</small></div></button>
                <button type="button" className={paymentMethod === "bank_transfer" ? "payment-option selected" : "payment-option"} onClick={() => selectPaymentMethod("bank_transfer")}><span>🏦</span><div><strong>Bank Transfer</strong><small>Transfer directly to farmer</small></div></button>
                <button type="button" className={paymentMethod === "offline" ? "payment-option selected" : "payment-option"} onClick={() => selectPaymentMethod("offline")}><span>🤝</span><div><strong>Offline Payment</strong><small>Cash or direct settlement</small></div></button>
              </div>
              {paymentLoading && <div className="payment-info">Loading seller payment details...</div>}
              {paymentMethod === "upi" && !paymentLoading && <div className="payment-info">
                <h4>Pay the farmer directly</h4>
                {paymentDetails?.upi_id ? <p><strong>UPI ID:</strong> {paymentDetails.upi_id}</p> : <p>Farmer has not added a UPI ID yet.</p>}
                {paymentDetails?.qr_code_url && <img className="payment-qr" src={paymentDetails.qr_code_url} alt="Farmer UPI QR" />}
                <p>After payment, enter the transaction ID below.</p>
              </div>}
              {paymentMethod === "bank_transfer" && !paymentLoading && <div className="payment-info">
                <h4>Farmer bank details</h4>
                {paymentDetails?.bank_account_name && <p><strong>Name:</strong> {paymentDetails.bank_account_name}</p>}
                {paymentDetails?.bank_account_number && <p><strong>Account:</strong> {paymentDetails.bank_account_number}</p>}
                {paymentDetails?.bank_ifsc && <p><strong>IFSC:</strong> {paymentDetails.bank_ifsc}</p>}
                <p>After transfer, enter the transaction ID below.</p>
              </div>}
              {paymentMethod === "offline" && <div className="payment-info"><h4>Offline settlement</h4><p>Arrange cash or direct settlement with the farmer. The farmer must confirm receipt before the order can be confirmed.</p></div>}
              {paymentMethod && paymentMethod !== "offline" && <div className="form-group"><label>Transaction ID *</label><input value={transactionId} onChange={e => setTransactionId(e.target.value)} placeholder="Enter UPI/bank transaction reference" /></div>}
              <div className="delivery-section">
                <div className="delivery-section-header">
                  <div>
                    <h4>Delivery Option</h4>
                    <p>Choose how you want to receive this order.</p>
                  </div>
                </div>

                <div className="delivery-options">
                  <button
                    type="button"
                    className={`delivery-option ${deliveryMethod === "farmer_delivery" ? "selected" : ""}`}
                    onClick={() => setDeliveryMethod("farmer_delivery")}
                  >
                    <span>🚚</span>
                    <div><strong>Farmer Delivery</strong><small>Farmer delivers to your address</small></div>
                  </button>

                  <button
                    type="button"
                    className={`delivery-option ${deliveryMethod === "transporter" ? "selected" : ""}`}
                    onClick={() => setDeliveryMethod("transporter")}
                  >
                    <span>🚛</span>
                    <div><strong>Transporter</strong><small>Use a transport service</small></div>
                  </button>

                  <button
                    type="button"
                    className={`delivery-option ${deliveryMethod === "buyer_pickup" ? "selected" : ""}`}
                    onClick={() => setDeliveryMethod("buyer_pickup")}
                  >
                    <span>📍</span>
                    <div><strong>Buyer Pickup</strong><small>Collect from the farmer</small></div>
                  </button>
                </div>

                {deliveryMethod !== "buyer_pickup" ? (
                  <div className="delivery-form">
                    <div className="form-group">
                      <label>Delivery Address *</label>
                      <textarea
                        value={deliveryForm.address}
                        onChange={e => setDeliveryForm({ ...deliveryForm, address: e.target.value })}
                        placeholder="House / street / area"
                        required
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>City *</label>
                        <input
                          value={deliveryForm.city}
                          onChange={e => setDeliveryForm({ ...deliveryForm, city: e.target.value })}
                          placeholder="City"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Pincode *</label>
                        <input
                          inputMode="numeric"
                          maxLength="6"
                          value={deliveryForm.pincode}
                          onChange={e => setDeliveryForm({
                            ...deliveryForm,
                            pincode: e.target.value.replace(/\D/g, "").slice(0, 6)
                          })}
                          placeholder="6-digit pincode"
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Phone *</label>
                      <input
                        type="tel"
                        value={deliveryForm.phone}
                        onChange={e => setDeliveryForm({ ...deliveryForm, phone: e.target.value })}
                        placeholder="Contact number"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="delivery-info">
                    <h4>Pickup from Farmer</h4>
                    <p>Collect the order from the farmer's listed location. The farmer can confirm the order after payment verification.</p>
                    {buyListing.location && <p><strong>Pickup location:</strong> {buyListing.location}</p>}
                  </div>
                )}
              </div>

              {buyError && <div className="modal-error">{buyError}</div>}
              {buySuccess && <div className="modal-success">{buySuccess}</div>}
              <div className="modal-actions"><button type="button" className="cancel-button" onClick={closeBuyModal}>Cancel</button><button className="primary-action" disabled={buySubmitting}>{buySubmitting ? "Processing..." : "Place Order"}</button></div>
            </form>
          </div>
        </div>
      )}

      {showPaymentSettings && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setShowPaymentSettings(false)}>
          <div className="listing-modal">
            <div className="modal-header"><div><p className="dashboard-label">SELLER PAYMENT SETTINGS</p><h2>Payment Details</h2><p>These details are shown to buyers for manual payments.</p></div><button className="modal-close" onClick={() => setShowPaymentSettings(false)}>×</button></div>
            <form onSubmit={savePaymentSettings}>
              <div className="form-group"><label>UPI ID</label><input value={paymentSettingsForm.upi_id} onChange={e => setPaymentSettingsForm({...paymentSettingsForm, upi_id: e.target.value})} placeholder="example@upi" /></div>
              <div className="form-group"><label>Bank account name</label><input value={paymentSettingsForm.bank_account_name} onChange={e => setPaymentSettingsForm({...paymentSettingsForm, bank_account_name: e.target.value})} /></div>
              <div className="form-group"><label>Bank account number</label><input value={paymentSettingsForm.bank_account_number} onChange={e => setPaymentSettingsForm({...paymentSettingsForm, bank_account_number: e.target.value})} /></div>
              <div className="form-group"><label>IFSC</label><input value={paymentSettingsForm.bank_ifsc} onChange={e => setPaymentSettingsForm({...paymentSettingsForm, bank_ifsc: e.target.value})} /></div>
              <div className="form-group">
                <label>QR image URL</label>
                <input
                  value={paymentSettingsForm.qr_code_url}
                  onChange={e => setPaymentSettingsForm({...paymentSettingsForm, qr_code_url: e.target.value})}
                  placeholder="Optional image URL"
                />
                <div style={{ marginTop: "8px" }}>
                  <label style={{ cursor: "pointer", fontSize: "13px", fontWeight: 700 }}>
                    Or choose QR image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleQrImage}
                      style={{ display: "block", marginTop: "6px" }}
                    />
                  </label>
                </div>
                {paymentSettingsForm.qr_code_url.startsWith("data:image/") && (
                  <img
                    src={paymentSettingsForm.qr_code_url}
                    alt="QR preview"
                    style={{
                      display: "block",
                      width: "150px",
                      height: "150px",
                      objectFit: "contain",
                      marginTop: "10px",
                      border: "1px solid #dce9df",
                      borderRadius: "10px"
                    }}
                  />
                )}
              </div>
              {paymentSettingsMessage && <div className={paymentSettingsMessage.includes("successfully") ? "modal-success" : "modal-error"}>{paymentSettingsMessage}</div>}
              <div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setShowPaymentSettings(false)}>Close</button><button className="primary-action">Save Details</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
