"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

type SiteOption = {
  id: string;
  code: string | null;
  name: string | null;
  is_active?: boolean | null;
};

type ProductOption = {
  id: string;
  name: string | null;
  sku: string | null;
  description?: string | null;
  unit?: string | null;
  stock_unit_code?: string | null;
  is_active?: boolean | null;
  site_ids?: string[];
  site_prices?: Record<string, number | null>;
  site_recipe_costs?: Record<string, number | null>;
  default_price?: number | null;
};

type CommercialCategoryOption = {
  id: string;
  site_id: string;
  name: string | null;
  code: string | null;
  is_active?: boolean | null;
};

type CommercialCollectionOption = {
  id: string;
  site_id: string;
  name: string | null;
  subtitle: string | null;
  code: string | null;
  kind: string | null;
  is_active?: boolean | null;
};

type CollectionCategoryLinkOption = {
  collection_id: string;
  commercial_category_id: string;
  sort_order?: number | null;
  is_active?: boolean | null;
};

type ExistingCommercialItemOption = {
  id: string;
  site_id: string;
  product_id: string | null;
  name: string | null;
  is_active?: boolean | null;
};

type CommercialCoverageSite = {
  site_id: string;
  site_label: string;
  total_sellable: number;
  created_count: number;
  missing_count: number;
  missing_products: Array<{
    id: string;
    name: string | null;
    sku: string | null;
  }>;
};

type MenuItemFormValues = {
  id?: string;
  code: string;
  name: string;
  description: string;
  product_id: string;
  price_amount: string;
  compare_at_amount: string;
  sort_order: string;
  is_active: boolean;
  is_featured: boolean;
  site_id: string;
  commercial_collection_ids?: string[];
  commercial_category_id: string;
  category_label: string;
  image_url: string;
  badges_csv: string;
  fulfillment_delivery: boolean;
  fulfillment_pickup: boolean;
  fulfillment_on_premise: boolean;
  metadata_extra: string;
  display_group?: string;
  variant_label?: string;
  pass_card_layout?: "compact" | "featured" | string;
  opens_detail_modal?: boolean;
};

type MenuItemFormProps = {
  mode: "create" | "edit";
  sites: SiteOption[];
  products: ProductOption[];
  categories: CommercialCategoryOption[];
  collections?: CommercialCollectionOption[];
  collectionCategoryLinks?: CollectionCategoryLinkOption[];
  existingCommercialItems?: ExistingCommercialItemOption[];
  commercialCoverage?: CommercialCoverageSite[];
  initial: MenuItemFormValues;
  action: (formData: FormData) => void | Promise<void>;
  formId?: string;
  secondaryActions?: ReactNode;
};

const PRODUCT_UPLOAD_ENDPOINT = "/api/viso/upload-commercial-menu-image";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getProductDisplayName(product: ProductOption) {
  return product.name?.trim() || product.sku?.trim() || "Producto sin nombre";
}

function getProductSearchText(product: ProductOption) {
  return normalizeSearchValue([product.name, product.sku, product.id].filter(Boolean).join(" "));
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCopInput(value: string) {
  const digits = onlyDigits(value);
  if (!digits || Number(digits) <= 0) return "";
  return `$ ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(digits))}`;
}

function asCop(value: number | string | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(parsed);
}

function collectionLabel(collection: CommercialCollectionOption) {
  return collection.name?.trim() || collection.code?.trim() || "Colección sin nombre";
}

function categoryLabel(category: CommercialCategoryOption) {
  return category.name?.trim() || category.code?.trim() || "Categoría sin nombre";
}

export function MenuItemForm({
  mode,
  sites,
  products,
  categories,
  collections = [],
  collectionCategoryLinks = [],
  existingCommercialItems = [],
  commercialCoverage = [],
  initial,
  action,
  formId,
  secondaryActions,
}: MenuItemFormProps) {
  const initialCollectionIds = Array.from(
    new Set((initial.commercial_collection_ids ?? []).map((id) => String(id).trim()).filter(Boolean)),
  );

  const [siteId, setSiteId] = useState(initial.site_id || sites[0]?.id || "");
  const [primaryCollectionId, setPrimaryCollectionId] = useState(initialCollectionIds[0] ?? "");
  const [additionalCollectionIds, setAdditionalCollectionIds] = useState<string[]>(
    initialCollectionIds.slice(1),
  );
  const [commercialCategoryId, setCommercialCategoryId] = useState(initial.commercial_category_id);
  const [productId, setProductId] = useState(initial.product_id);
  const [productQuery, setProductQuery] = useState("");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [showExistingProducts, setShowExistingProducts] = useState(false);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [priceAmount, setPriceAmount] = useState(initial.price_amount);
  const [compareAtAmount, setCompareAtAmount] = useState(initial.compare_at_amount);
  const [imageUrl, setImageUrl] = useState(initial.image_url);
  const [badgesCsv, setBadgesCsv] = useState(initial.badges_csv);
  const [displayGroup, setDisplayGroup] = useState(initial.display_group ?? "");
  const [variantLabel, setVariantLabel] = useState(initial.variant_label ?? "");
  const [isActive, setIsActive] = useState(initial.is_active);
  const [isFeatured, setIsFeatured] = useState(initial.is_featured);
  const [fulfillmentDelivery, setFulfillmentDelivery] = useState(initial.fulfillment_delivery);
  const [fulfillmentPickup, setFulfillmentPickup] = useState(initial.fulfillment_pickup);
  const [fulfillmentOnPremise, setFulfillmentOnPremise] = useState(initial.fulfillment_on_premise);
  const [passCardLayout, setPassCardLayout] = useState(
    initial.pass_card_layout === "featured" ? "featured" : "compact",
  );
  const [opensDetailModal, setOpensDetailModal] = useState(Boolean(initial.opens_detail_modal));
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");

  const generatedFormId = useId().replace(/:/g, "");
  const resolvedFormId = formId || `menu-item-form-${generatedFormId}`;
  const productPickerRef = useRef<HTMLDivElement | null>(null);

  const visibleCollections = useMemo(
    () =>
      collections.filter(
        (collection) => collection.is_active !== false && collection.site_id === siteId,
      ),
    [collections, siteId],
  );

  const orderedCategoryIdsByCollection = useMemo(() => {
    const map = new Map<string, Array<{ categoryId: string; sortOrder: number }>>();

    for (const link of collectionCategoryLinks) {
      if (link.is_active === false) continue;
      const collectionId = String(link.collection_id ?? "").trim();
      const categoryId = String(link.commercial_category_id ?? "").trim();
      if (!collectionId || !categoryId) continue;
      const current = map.get(collectionId) ?? [];
      current.push({
        categoryId,
        sortOrder: Number.isFinite(Number(link.sort_order))
          ? Number(link.sort_order)
          : Number.MAX_SAFE_INTEGER,
      });
      map.set(collectionId, current);
    }

    for (const entries of map.values()) {
      entries.sort((a, b) => a.sortOrder - b.sortOrder || a.categoryId.localeCompare(b.categoryId));
    }

    return map;
  }, [collectionCategoryLinks]);

  const categoryIdSetByCollection = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [collectionId, entries] of orderedCategoryIdsByCollection.entries()) {
      map.set(collectionId, new Set(entries.map((entry) => entry.categoryId)));
    }
    return map;
  }, [orderedCategoryIdsByCollection]);

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const visibleCategories = useMemo(() => {
    if (!primaryCollectionId) return [];
    return (orderedCategoryIdsByCollection.get(primaryCollectionId) ?? [])
      .map((entry) => categoriesById.get(entry.categoryId))
      .filter(
        (category): category is CommercialCategoryOption =>
          Boolean(category) && category?.is_active !== false && category?.site_id === siteId,
      );
  }, [categoriesById, orderedCategoryIdsByCollection, primaryCollectionId, siteId]);

  const selectedCategory = useMemo(
    () => visibleCategories.find((category) => category.id === commercialCategoryId) ?? null,
    [commercialCategoryId, visibleCategories],
  );

  const compatibleAdditionalCollections = useMemo(() => {
    if (!commercialCategoryId) return [];
    return visibleCollections.filter(
      (collection) =>
        collection.id !== primaryCollectionId &&
        (categoryIdSetByCollection.get(collection.id)?.has(commercialCategoryId) ?? false),
    );
  }, [categoryIdSetByCollection, commercialCategoryId, primaryCollectionId, visibleCollections]);

  const selectedCollectionIds = useMemo(
    () =>
      primaryCollectionId
        ? [
            primaryCollectionId,
            ...additionalCollectionIds.filter(
              (id) => id !== primaryCollectionId && compatibleAdditionalCollections.some((item) => item.id === id),
            ),
          ]
        : [],
    [additionalCollectionIds, compatibleAdditionalCollections, primaryCollectionId],
  );

  const existingCommercialProductIdsBySite = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const item of existingCommercialItems) {
      if (item.is_active === false) continue;
      const itemSiteId = String(item.site_id ?? "").trim();
      const itemProductId = String(item.product_id ?? "").trim();
      if (!itemSiteId || !itemProductId) continue;
      const current = map.get(itemSiteId) ?? new Set<string>();
      current.add(itemProductId);
      map.set(itemSiteId, current);
    }
    if (mode === "edit" && initial.site_id && initial.product_id) {
      map.get(initial.site_id)?.delete(initial.product_id);
    }
    return map;
  }, [existingCommercialItems, initial.product_id, initial.site_id, mode]);

  const isProductAlreadyCreatedForSite = useCallback(
    (targetProductId: string, targetSiteId: string) =>
      Boolean(
        targetProductId &&
          targetSiteId &&
          existingCommercialProductIdsBySite.get(targetSiteId)?.has(targetProductId),
      ),
    [existingCommercialProductIdsBySite],
  );

  const eligibleProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.is_active !== false &&
          (!siteId || (product.site_ids ?? []).includes(siteId)),
      ),
    [products, siteId],
  );

  const availableProducts = useMemo(
    () =>
      eligibleProducts.filter(
        (product) => !isProductAlreadyCreatedForSite(product.id, siteId),
      ),
    [eligibleProducts, isProductAlreadyCreatedForSite, siteId],
  );

  const visibleProducts = showExistingProducts ? eligibleProducts : availableProducts;
  const normalizedProductQuery = normalizeSearchValue(productQuery);
  const productResults = useMemo(
    () =>
      visibleProducts
        .filter((product) =>
          normalizedProductQuery
            ? getProductSearchText(product).includes(normalizedProductQuery)
            : true,
        )
        .slice(0, normalizedProductQuery ? 30 : 12),
    [normalizedProductQuery, visibleProducts],
  );

  const selectedProduct = useMemo(
    () => eligibleProducts.find((product) => product.id === productId) ?? null,
    [eligibleProducts, productId],
  );

  const selectedProductAlreadyCreated = isProductAlreadyCreatedForSite(productId, siteId);

  const selectedSiteCoverage = useMemo(
    () => commercialCoverage.find((site) => site.site_id === siteId) ?? null,
    [commercialCoverage, siteId],
  );

  const suggestedPrice = useMemo(() => {
    if (!selectedProduct) return null;
    const sitePrice = selectedProduct.site_prices?.[siteId];
    if (typeof sitePrice === "number" && Number.isFinite(sitePrice) && sitePrice > 0) return sitePrice;
    const fallback = selectedProduct.default_price;
    return typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0 ? fallback : null;
  }, [selectedProduct, siteId]);

  const suggestedRecipeCost = useMemo(() => {
    const value = selectedProduct?.site_recipe_costs?.[siteId];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  }, [selectedProduct, siteId]);

  const currentMarginPct = useMemo(() => {
    const currentPrice = Number(priceAmount);
    if (suggestedRecipeCost == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
    return ((currentPrice - suggestedRecipeCost) / currentPrice) * 100;
  }, [priceAmount, suggestedRecipeCost]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (mode !== "create" || !selectedProduct) return;
      if (!name.trim()) setName(getProductDisplayName(selectedProduct));
      if (!description.trim() && selectedProduct.description?.trim()) {
        setDescription(selectedProduct.description.trim());
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [description, mode, name, selectedProduct]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (suggestedPrice == null || priceAmount.trim()) return;
      setPriceAmount(String(Math.round(suggestedPrice)));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [priceAmount, suggestedPrice]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const validCollectionIds = new Set(visibleCollections.map((collection) => collection.id));
      if (primaryCollectionId && !validCollectionIds.has(primaryCollectionId)) {
        setPrimaryCollectionId("");
        setCommercialCategoryId("");
        setAdditionalCollectionIds([]);
      }
      setAdditionalCollectionIds((current) => current.filter((id) => validCollectionIds.has(id)));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [primaryCollectionId, visibleCollections]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!commercialCategoryId) return;
      const isValid = visibleCategories.some((category) => category.id === commercialCategoryId);
      if (!isValid) {
        setCommercialCategoryId("");
        setAdditionalCollectionIds([]);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [commercialCategoryId, visibleCategories]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAdditionalCollectionIds((current) =>
        current.filter((id) => compatibleAdditionalCollections.some((collection) => collection.id === id)),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [compatibleAdditionalCollections]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!productId) return;
      const stillValid = eligibleProducts.some((product) => product.id === productId);
      if (!stillValid || selectedProductAlreadyCreated) {
        setProductId("");
        setProductQuery("");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [eligibleProducts, productId, selectedProductAlreadyCreated]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && productPickerRef.current && !productPickerRef.current.contains(target)) {
        setIsProductPickerOpen(false);
      }
    }
    if (isProductPickerOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProductPickerOpen]);

  const handleSiteChange = (nextSiteId: string) => {
    setSiteId(nextSiteId);
    setPrimaryCollectionId("");
    setCommercialCategoryId("");
    setAdditionalCollectionIds([]);
    setProductId("");
    setProductQuery("");
  };

  const handlePrimaryCollectionChange = (nextCollectionId: string) => {
    setPrimaryCollectionId(nextCollectionId);
    setCommercialCategoryId("");
    setAdditionalCollectionIds([]);
  };

  const handleCategoryChange = (nextCategoryId: string) => {
    setCommercialCategoryId(nextCategoryId);
    setAdditionalCollectionIds((current) =>
      current.filter(
        (collectionId) => categoryIdSetByCollection.get(collectionId)?.has(nextCategoryId) ?? false,
      ),
    );
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadStatus("error");
      setUploadMessage("La imagen supera 5 MB.");
      return;
    }

    setUploadStatus("uploading");
    setUploadMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "catalog-item");
      formData.append("ownerId", initial.id || initial.code || name || "pending");

      const response = await fetch(PRODUCT_UPLOAD_ENDPOINT, { method: "POST", body: formData });
      const raw = await response.text();
      let payload: Record<string, unknown> | null = null;
      try {
        payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(
          (typeof payload?.error === "string" && payload.error) || raw || "No se pudo subir la imagen.",
        );
      }

      const nextUrl = typeof payload?.url === "string" ? payload.url : "";
      setImageUrl(nextUrl);
      setUploadStatus("done");
      setUploadMessage("Imagen cargada.");
    } catch (error) {
      setUploadStatus("error");
      setUploadMessage(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    }
  };

  const submitDisabled =
    !siteId ||
    !primaryCollectionId ||
    !commercialCategoryId ||
    !productId ||
    !name.trim() ||
    Number(priceAmount) <= 0 ||
    (mode === "create" && selectedProductAlreadyCreated);

  return (
    <div className="space-y-8">
      <form id={resolvedFormId} action={action} className="space-y-8">
        <input type="hidden" name="id" value={initial.id ?? ""} />
        <input type="hidden" name="code" value={initial.code} />
        <input type="hidden" name="sort_order" value={initial.sort_order} />
        <input type="hidden" name="metadata_extra" value={initial.metadata_extra} />
        <input type="hidden" name="commercial_collection_id" value={primaryCollectionId} />
        {selectedCollectionIds.map((collectionId) => (
          <input
            key={collectionId}
            type="hidden"
            name="commercial_collection_ids"
            value={collectionId}
          />
        ))}

        <section className="ui-panel space-y-5">
          <div>
            <div className="ui-h3">1. Sede de venta</div>
            <p className="ui-caption">Elige el negocio donde se publicará el producto.</p>
          </div>
          <label className="space-y-2">
            <span className="ui-label">Negocio / sede</span>
            <select
              name="site_id"
              className="ui-input"
              value={siteId}
              onChange={(event) => handleSiteChange(event.target.value)}
              required
            >
              <option value="">Selecciona una sede</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.code ?? "Sin nombre"}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="ui-panel space-y-5">
          <div>
            <div className="ui-h3">2. Colección principal</div>
            <p className="ui-caption">
              Primero elige el menú o colección. La siguiente sección mostrará únicamente sus categorías asignadas.
            </p>
          </div>

          {visibleCollections.length === 0 ? (
            <div className="ui-alert ui-alert--warning">
              Esta sede no tiene colecciones activas. Configúralas antes de publicar productos.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleCollections.map((collection) => {
                const selected = collection.id === primaryCollectionId;
                const categoryCount = orderedCategoryIdsByCollection.get(collection.id)?.length ?? 0;
                return (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => handlePrimaryCollectionChange(collection.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selected
                        ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)]"
                        : "border-[var(--ui-border)] bg-white hover:bg-[var(--ui-surface-2)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-[var(--ui-text)]">{collectionLabel(collection)}</div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          {collection.subtitle || (collection.kind === "main" ? "Menú permanente" : "Colección comercial")}
                        </div>
                      </div>
                      <span className="ui-chip">{categoryCount} categorías</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="ui-panel space-y-6">
          <div>
            <div className="ui-h3">3. Categoría y producto</div>
            <p className="ui-caption">
              La categoría depende de la colección principal seleccionada.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="ui-label">Categoría de la colección</span>
              <select
                name="commercial_category_id"
                className="ui-input"
                value={commercialCategoryId}
                onChange={(event) => handleCategoryChange(event.target.value)}
                disabled={!primaryCollectionId || visibleCategories.length === 0}
                required
              >
                <option value="">
                  {!primaryCollectionId
                    ? "Primero selecciona una colección"
                    : visibleCategories.length === 0
                      ? "La colección no tiene categorías"
                      : "Selecciona una categoría"}
                </option>
                {visibleCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </select>
              <input
                name="category_label"
                type="hidden"
                value={selectedCategory ? categoryLabel(selectedCategory) : initial.category_label}
                readOnly
              />
              {primaryCollectionId && visibleCategories.length === 0 ? (
                <p className="text-xs font-semibold text-amber-700">
                  Agrega categorías a esta colección desde Colecciones comerciales.
                </p>
              ) : null}
            </label>

            <div className="space-y-2" ref={productPickerRef}>
              <div className="flex items-center justify-between gap-2">
                <span className="ui-label">Producto de Vento</span>
                {mode === "create" ? <span className="ui-chip">{availableProducts.length} disponibles</span> : null}
              </div>
              <input type="hidden" name="product_id" value={productId} />
              <div className="relative">
                <input
                  type="search"
                  className="ui-input"
                  value={productQuery}
                  onChange={(event) => {
                    setProductQuery(event.target.value);
                    setIsProductPickerOpen(true);
                  }}
                  onFocus={() => setIsProductPickerOpen(true)}
                  placeholder={selectedProduct ? getProductDisplayName(selectedProduct) : "Buscar por nombre o SKU"}
                />
                {isProductPickerOpen ? (
                  <div className="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-[var(--ui-border)] bg-white shadow-[var(--ui-shadow-2)]">
                    {productResults.length > 0 ? (
                      productResults.map((product) => {
                        const alreadyCreated = isProductAlreadyCreatedForSite(product.id, siteId);
                        return (
                          <button
                            key={product.id}
                            type="button"
                            disabled={alreadyCreated}
                            className={`block w-full border-b border-[var(--ui-border)] px-3 py-3 text-left last:border-b-0 ${
                              alreadyCreated ? "cursor-not-allowed opacity-50" : "hover:bg-[var(--ui-surface-2)]"
                            }`}
                            onClick={() => {
                              setProductId(product.id);
                              setProductQuery("");
                              setIsProductPickerOpen(false);
                            }}
                          >
                            <span className="block text-sm font-black">{getProductDisplayName(product)}</span>
                            <span className="ui-caption">
                              {alreadyCreated
                                ? "Ya publicado en esta sede"
                                : product.sku
                                  ? `SKU ${product.sku}`
                                  : "Disponible para esta sede"}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-4 text-sm text-[var(--ui-muted)]">No hay resultados.</div>
                    )}
                  </div>
                ) : null}
              </div>

              {selectedProduct ? (
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                  <div className="text-sm font-black">{getProductDisplayName(selectedProduct)}</div>
                  <div className="ui-caption mt-1">
                    {selectedProduct.sku ? `SKU ${selectedProduct.sku}` : "Producto seleccionado"}
                  </div>
                </div>
              ) : null}

              {mode === "create" && eligibleProducts.length !== availableProducts.length ? (
                <label className="flex items-center gap-2 text-xs text-[var(--ui-muted)]">
                  <input
                    type="checkbox"
                    checked={showExistingProducts}
                    onChange={(event) => setShowExistingProducts(event.target.checked)}
                  />
                  Mostrar también productos ya publicados
                </label>
              ) : null}
            </div>
          </div>
        </section>

        <section className="ui-panel space-y-5">
          <div>
            <div className="ui-h3">4. Colecciones adicionales</div>
            <p className="ui-caption">
              Opcional. Solo se muestran colecciones que también contienen la categoría elegida.
            </p>
          </div>

          {!commercialCategoryId ? (
            <div className="ui-empty">Selecciona una categoría para ver colecciones compatibles.</div>
          ) : compatibleAdditionalCollections.length === 0 ? (
            <div className="ui-empty">No hay otras colecciones compatibles con esta categoría.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {compatibleAdditionalCollections.map((collection) => {
                const checked = additionalCollectionIds.includes(collection.id);
                return (
                  <label
                    key={collection.id}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      checked
                        ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)]"
                        : "border-[var(--ui-border)] bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setAdditionalCollectionIds((current) =>
                          event.target.checked
                            ? Array.from(new Set([...current, collection.id]))
                            : current.filter((id) => id !== collection.id),
                        )
                      }
                      className="mr-3"
                    />
                    <span className="font-black text-[var(--ui-text)]">{collectionLabel(collection)}</span>
                    <span className="mt-1 block text-xs text-[var(--ui-muted)]">
                      {collection.subtitle || "Colección compatible"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {mode === "create" && selectedSiteCoverage ? (
          <section className="ui-panel space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="ui-h3">Estado de publicación</div>
                <p className="ui-caption">Cobertura de productos operacionales para esta sede.</p>
              </div>
              <span className={`ui-chip ${selectedSiteCoverage.missing_count === 0 ? "ui-chip--success" : "ui-chip--warn"}`}>
                {selectedSiteCoverage.missing_count === 0
                  ? "Todo publicado"
                  : `${selectedSiteCoverage.missing_count} pendientes`}
              </span>
            </div>
          </section>
        ) : null}

        <section className="ui-panel space-y-6">
          <div>
            <div className="ui-h3">5. Información comercial</div>
            <p className="ui-caption">Define cómo verá el cliente el producto en Vento Pass.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="ui-label">Nombre</span>
              <input
                name="name"
                className="ui-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>

            <div className="space-y-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
              <div className="ui-label">Publicación</div>
              <label className="flex items-center gap-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                />
                Visible para los clientes
              </label>
              <label className="flex items-center gap-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  name="is_featured"
                  checked={isFeatured}
                  onChange={(event) => setIsFeatured(event.target.checked)}
                />
                Producto destacado
              </label>
            </div>

            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Descripción</span>
              <textarea
                name="description"
                className="ui-input min-h-28 py-3"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Precio comercial</span>
              <input type="hidden" name="price_amount" value={priceAmount} />
              <input
                type="text"
                inputMode="numeric"
                className="ui-input"
                value={formatCopInput(priceAmount)}
                onChange={(event) => setPriceAmount(onlyDigits(event.target.value))}
                placeholder="$ 22.000"
                required
              />
              {suggestedPrice != null ? (
                <p className="ui-caption">Precio sugerido: {asCop(suggestedPrice)}</p>
              ) : null}
              {suggestedRecipeCost != null ? (
                <p className="ui-caption">Costo estimado: {asCop(suggestedRecipeCost)}</p>
              ) : null}
              {currentMarginPct != null ? (
                <p className="ui-caption">Margen estimado: {currentMarginPct.toFixed(2)}%</p>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="ui-label">Precio anterior opcional</span>
              <input type="hidden" name="compare_at_amount" value={compareAtAmount} />
              <input
                type="text"
                inputMode="numeric"
                className="ui-input"
                value={formatCopInput(compareAtAmount)}
                onChange={(event) => setCompareAtAmount(onlyDigits(event.target.value))}
                placeholder="$ 25.000"
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="ui-label">Etiquetas visibles</span>
              <input
                name="badges_csv"
                className="ui-input"
                value={badgesCsv}
                onChange={(event) => setBadgesCsv(event.target.value)}
                placeholder="Popular, Nuevo, Recomendado"
              />
            </label>

            <div className="space-y-3 sm:col-span-2">
              <span className="ui-label">Imagen</span>
              <input type="hidden" name="image_url" value={imageUrl} />
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  className="ui-input"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="URL de la imagen"
                />
                <label className="ui-btn ui-btn--ghost cursor-pointer">
                  {uploadStatus === "uploading" ? "Subiendo..." : "Subir imagen"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadStatus === "uploading"}
                    onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              {uploadMessage ? (
                <p className={`text-xs ${uploadStatus === "error" ? "text-rose-700" : "text-emerald-700"}`}>
                  {uploadMessage}
                </p>
              ) : null}
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Vista previa" className="h-40 w-full rounded-2xl object-cover" />
              ) : null}
            </div>
          </div>
        </section>

        <section className="ui-panel space-y-5">
          <div>
            <div className="ui-h3">6. Presentación y opciones</div>
            <p className="ui-caption">Configura variantes, diseño de tarjeta y canales de entrega.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="ui-label">Familia del producto</span>
              <input
                name="display_group"
                className="ui-input"
                value={displayGroup}
                onChange={(event) => setDisplayGroup(event.target.value)}
                placeholder="Ejemplo: Soda Hatsu"
              />
            </label>
            <label className="space-y-2">
              <span className="ui-label">Nombre de esta versión</span>
              <input
                name="variant_label"
                className="ui-input"
                value={variantLabel}
                onChange={(event) => setVariantLabel(event.target.value)}
                placeholder="Ejemplo: Sandía"
              />
            </label>

            <label className="space-y-2">
              <span className="ui-label">Diseño de tarjeta</span>
              <select
                name="pass_card_layout"
                className="ui-input"
                value={passCardLayout}
                onChange={(event) => setPassCardLayout(event.target.value === "featured" ? "featured" : "compact")}
              >
                <option value="compact">Compacta</option>
                <option value="featured">Destacada</option>
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-[var(--ui-border)] p-4 text-sm font-semibold">
              <input
                type="checkbox"
                name="opens_detail_modal"
                checked={opensDetailModal}
                onChange={(event) => setOpensDetailModal(event.target.checked)}
              />
              Abrir detalle antes de agregar
            </label>
          </div>

          <div className="space-y-2">
            <span className="ui-label">Dónde puede recibirlo el cliente</span>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="fulfillment_delivery"
                  checked={fulfillmentDelivery}
                  onChange={(event) => setFulfillmentDelivery(event.target.checked)}
                />
                Domicilio
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="fulfillment_pickup"
                  checked={fulfillmentPickup}
                  onChange={(event) => setFulfillmentPickup(event.target.checked)}
                />
                Recoger
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="fulfillment_on_premise"
                  checked={fulfillmentOnPremise}
                  onChange={(event) => setFulfillmentOnPremise(event.target.checked)}
                />
                En sitio
              </label>
            </div>
          </div>
        </section>
      </form>

      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap gap-2">{secondaryActions}</div>
        <button
          type="submit"
          form={resolvedFormId}
          className="ui-btn ui-btn--brand"
          disabled={submitDisabled}
        >
          {mode === "create" ? "Publicar producto" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
