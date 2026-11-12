import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { StoreProvider, ToastProvider } from './context/StoreContext';
import { AdminLayout } from './admin/AdminLayout';
import { AdminAuditPage } from './admin/AdminAudit';
import { AdminCasesPage } from './admin/AdminCases';
import { AdminDashboard } from './admin/AdminDashboard';
import { AdminInventoryPage } from './admin/AdminInventory';
import { AdminOrdersPage, AdminOrderDetailPage } from './admin/AdminOrders';
import { AdminProductEditPage, AdminProductsPage } from './admin/AdminProducts';
import { AdminShippingPage } from './admin/AdminShipping';
import { AdminLoginPage, ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages';
import { AccountPage, OrderDetailPage } from './pages/AccountPages';
import { CartPage } from './pages/CartPage';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { HelpPage, NotFoundPage, SimulationPaymentPage } from './pages/StorePages';

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route path="katalog" element={<CatalogPage />} />
                  <Route path="produk/:slug" element={<ProductPage />} />
                  <Route path="keranjang" element={<CartPage />} />
                  <Route path="checkout" element={<CheckoutPage />} />
                  <Route path="masuk" element={<LoginPage />} />
                  <Route path="daftar" element={<RegisterPage />} />
                  <Route path="lupa-kata-sandi" element={<ForgotPasswordPage />} />
                  <Route path="reset-kata-sandi" element={<ResetPasswordPage />} />
                  <Route path="akun" element={<AccountPage />} />
                  <Route path="akun/pesanan/:orderNumber" element={<OrderDetailPage />} />
                  <Route path="pembayaran-simulasi/:gatewayOrderId" element={<SimulationPaymentPage />} />
                  <Route path="bantuan" element={<HelpPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
                <Route path="admin/masuk" element={<AdminLoginPage />} />
                <Route path="admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="produk" element={<AdminProductsPage />} />
                  <Route path="produk/baru" element={<AdminProductEditPage />} />
                  <Route path="produk/:id" element={<AdminProductEditPage />} />
                  <Route path="inventaris" element={<AdminInventoryPage />} />
                  <Route path="pengiriman" element={<AdminShippingPage />} />
                  <Route path="pesanan" element={<AdminOrdersPage />} />
                  <Route path="pesanan/:orderNumber" element={<AdminOrderDetailPage />} />
                  <Route path="kasus" element={<AdminCasesPage />} />
                  <Route path="audit" element={<AdminAuditPage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
