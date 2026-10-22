import { apiClient } from "@/lib/api-client";
import type { Cart } from "@/types/order.types";

export interface MatrixItem {
  variant_id: string;
  quantity: number;
}

export const cartService = {
  async getCart(): Promise<Cart> {
    return apiClient.get<Cart>("/api/v1/cart");
  },

  /** `acknowledgeBackorder`: the customer ticked that backordered lines ship when
   *  stock arrives. The server refuses backordered lines without it. */
  async addMatrix(product_id: string, items: MatrixItem[], acknowledgeBackorder = false): Promise<Cart> {
    return apiClient.post<Cart>("/api/v1/cart/add-matrix", {
      product_id, items, acknowledge_backorder: acknowledgeBackorder,
    });
  },

  async updateItem(item_id: string, quantity: number): Promise<Cart> {
    return apiClient.patch<Cart>(`/api/v1/cart/items/${item_id}`, { quantity });
  },

  async removeItem(item_id: string): Promise<Cart> {
    return apiClient.delete<Cart>(`/api/v1/cart/items/${item_id}`);
  },

  async saveTemplate(name: string): Promise<{ id: string; name: string }> {
    return apiClient.post("/api/v1/cart/save-template", { name });
  },

  async quickOrder(items: { sku: string; quantity: number }[], acknowledgeBackorder = false) {
    return apiClient.post("/api/v1/cart/quick-order", { items, acknowledge_backorder: acknowledgeBackorder });
  },
};
