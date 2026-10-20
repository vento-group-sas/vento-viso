"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type JsonRecord = Record<string, unknown>;

type SimpleGroupKind = "choice" | "extras" | "replacements" | "removals" | "preferences" | "recommendations";

type CatalogItemOptionGroupRow = {
  id: string;
  catalog_item_id: string;
  code: string;
  name: string;
  description: string | null;
  selection_type: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: boolean;
  metadata: JsonRecord | null;
};

type CatalogItemOptionRow = {
  id: string;
  option_group_id: string;
  code: string;
  name: string;
  description: string | null;
  price_delta_amount: number | string;
  image_url: string | null;
  product_id: string | null;
  effect_type: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  metadata: JsonRecord | null;
};

type CatalogItemOptionConsumptionRuleRow = {
  id: string;
  option_id: string;
  code: string;
  name: string;
  product_id: string;
  effect_type: string;
  quantity_per_option: number | string;
  stock_unit_code: string | null;
  is_active: boolean;
  sort_order: number;
};

type CatalogItemOptionRecipeEffectRow = {
  id: string;
  option_id: string;
  effect_type: string;
  target_ingredient_product_id: string;
  recipe_component_code: string | null;
  quantity_mode: string;
  quantity_amount: number | string | null;
  stock_unit_code: string | null;
  is_active: boolean;
  sort_order: number;
};

type OperationalProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string | null;
  is_active: boolean | null;
};

type RecipeIngredientWithProduct = {
  id: string;
  product_id: string;
  ingredient_product_id: string;
  quantity: number | string;
  is_active: boolean | null;
  product: OperationalProductRow | null;
};

type InventoryUnitRow = {
  code: string;
  name: string;
  symbol: string | null;
  family: string | null;
  is_active: boolean | null;
};

type CommercialCatalogRelationRow = {
  id: string;
  name: string | null;
  code: string | null;
  sort_order?: number | string | null;
};

type CommercialCatalogItemOptionRow = {
  id: string;
  name: string | null;
  product_id: string | null;
  description: string | null;
  price_amount: number | string | null;
  image_url: string | null;
  category_label: string | null;
  commercial_collection_id: string;
  commercial_category_id?: string | null;
  commercial_collection: CommercialCatalogRelationRow;
  commercial_category?: CommercialCatalogRelationRow | CommercialCatalogRelationRow[] | null;
  sort_order?: number | string | null;
  is_active: boolean | null;
};

type CurrentCatalogItemSnapshot = {
  id: string;
  site_id: string;
  product_id: string | null;
  name: string;
  metadata: JsonRecord | null;
};

type SharedCustomizationTemplateRow = {
  id: string;
  site_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  metadata: JsonRecord | null;
};

type SharedCustomizationTemplateGroupRow = {
  template_id: string;
  option_group_id: string;
  sort_order: number;
  is_active: boolean;
};

type SharedCustomizationTemplateAssignmentRow = {
  catalog_item_id: string;
  template_id: string;
  sort_order: number;
  is_active: boolean;
};

type VisualVariantRow = {
  id: string;
  name: string;
  code: string;
  price_amount: number | string | null;
  is_active: boolean;
  metadata: JsonRecord | null;
  sort_order: number | null;
};

type CatalogOptionVisualAssetRow = {
  id: string;
  site_id: string | null;
  asset_key: string;
  display_name: string;
  image_url: string;
  linked_product_id: string | null;
  linked_ingredient_product_id: string | null;
  option_code: string | null;
  normalized_option_name: string | null;
  scope: string;
  is_active: boolean;
  metadata: JsonRecord | null;
};

type SharedTemplateDraft = {
  name: string;
  description: string;
  groupIds: string[];
  variantIds: string[];
  isActive: boolean;
};

type PersonalizationSnapshot = {
  currentItem: CurrentCatalogItemSnapshot;
  visualVariants: VisualVariantRow[];
  sharedTemplates: SharedCustomizationTemplateRow[];
  sharedTemplateGroups: SharedCustomizationTemplateGroupRow[];
  sharedTemplateAssignments: SharedCustomizationTemplateAssignmentRow[];
  optionGroups: CatalogItemOptionGroupRow[];
  options: CatalogItemOptionRow[];
  consumptionRules: CatalogItemOptionConsumptionRuleRow[];
  recipeEffects: CatalogItemOptionRecipeEffectRow[];
  recipeIngredients: RecipeIngredientWithProduct[];
  consumptionProducts: OperationalProductRow[];
  inventoryUnits: InventoryUnitRow[];
  commercialCatalogItems: CommercialCatalogItemOptionRow[];
  visualAssets: CatalogOptionVisualAssetRow[];
};

type MutationResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  snapshot?: PersonalizationSnapshot;
};

type PersonalizationTypeCard = {
  kind: SimpleGroupKind;
  label: string;
  defaultName: string;
  description: string;
  maxSelect?: string;
};

const personalizationTypeCards: PersonalizationTypeCard[] = [
  {
    kind: "choice",
    label: "Tamaño o cantidad",
    defaultName: "Elige una opción",
    description: "Tamaños, cantidades, bases o acompañamientos obligatorios.",
  },
  {
    kind: "replacements",
    label: "Cambios",
    defaultName: "Cambios",
    description: "Reemplazos que consumen un insumo nuevo y retiran uno de la receta base.",
    maxSelect: "10",
  },
  {
    kind: "removals",
    label: "Ingredientes",
    defaultName: "Ingredientes",
    description: "Ingredientes que el cliente puede pedir retirar o ajustar.",
    maxSelect: "99",
  },
  {
    kind: "extras",
    label: "Extras",
    defaultName: "Extras",
    description: "Adiciones con o sin precio adicional.",
    maxSelect: "10",
  },
  {
    kind: "preferences",
    label: "Preferencias",
    defaultName: "Preferencias",
    description: "Indicaciones de preparación sin descuento de inventario.",
    maxSelect: "10",
  },
  {
    kind: "recommendations",
    label: "Sugerir producto",
    defaultName: "También puedes agregar",
    description: "Bebidas, postres o acompañamientos que el cliente puede sumar.",
    maxSelect: "10",
  },
];

const MENU_IMAGE_UPLOAD_ENDPOINT = "/api/viso/upload-commercial-menu-image";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function readGroupMetadata(value: JsonRecord | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getMetadataText(metadata: JsonRecord | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function getCurrentDisplayGroup(item: CurrentCatalogItemSnapshot | null | undefined) {
  return getMetadataText(item?.metadata, "display_group");
}

function getVariantLabel(item: VisualVariantRow) {
  return getMetadataText(item.metadata, "variant_label") || item.name;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function sortNumber(value: number | string | null | undefined, fallback = Number.MAX_SAFE_INTEGER) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getCommercialCatalogCollection(item: CommercialCatalogItemOptionRow) {
  return relationOne(item.commercial_collection);
}

function getCommercialCatalogCategory(item: CommercialCatalogItemOptionRow) {
  return relationOne(item.commercial_category);
}

function getCommercialCatalogCollectionLabel(item: CommercialCatalogItemOptionRow) {
  const collection = getCommercialCatalogCollection(item);
  return collection?.name || collection?.code || "Sin colección";
}

function getCommercialCatalogCategoryLabel(item: CommercialCatalogItemOptionRow) {
  const category = getCommercialCatalogCategory(item);
  return category?.name || category?.code || item.category_label || "Sin categoría";
}

function buildCommercialCatalogGroups(items: CommercialCatalogItemOptionRow[]) {
  const collectionMap = new Map<
    string,
    {
      key: string;
      label: string;
      sortOrder: number;
      categories: Map<
        string,
        {
          key: string;
          label: string;
          sortOrder: number;
          items: CommercialCatalogItemOptionRow[];
        }
      >;
    }
  >();

  for (const item of items.filter((catalogItem) => catalogItem.is_active !== false)) {
    const collection = getCommercialCatalogCollection(item);
    const category = getCommercialCatalogCategory(item);
    const collectionKey = item.commercial_collection_id;
    const categoryKey = item.commercial_category_id || category?.id || item.category_label || "__sin_categoria__";

    if (!collectionMap.has(collectionKey)) {
      collectionMap.set(collectionKey, {
        key: collectionKey,
        label: getCommercialCatalogCollectionLabel(item),
        sortOrder: sortNumber(collection?.sort_order),
        categories: new Map(),
      });
    }

    const collectionGroup = collectionMap.get(collectionKey)!;

    if (!collectionGroup.categories.has(categoryKey)) {
      collectionGroup.categories.set(categoryKey, {
        key: categoryKey,
        label: getCommercialCatalogCategoryLabel(item),
        sortOrder: sortNumber(category?.sort_order),
        items: [],
      });
    }

    collectionGroup.categories.get(categoryKey)!.items.push(item);
  }

  return Array.from(collectionMap.values())
    .map((collection) => ({
      ...collection,
      categories: Array.from(collection.categories.values())
        .map((category) => ({
          ...category,
          items: category.items.sort((a, b) => {
            const aOrder = sortNumber(a.sort_order);
            const bOrder = sortNumber(b.sort_order);

            if (aOrder !== bOrder) return aOrder - bOrder;
            return (a.name || "").localeCompare(b.name || "", "es-CO");
          }),
        }))
        .sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.label.localeCompare(b.label, "es-CO");
        }),
    }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label, "es-CO");
    });
}

function toggleStringValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function getDefaultSharedTemplateDraft(displayGroup: string, groups: CatalogItemOptionGroupRow[], variants: VisualVariantRow[]): SharedTemplateDraft {
  return {
    name: displayGroup ? `${displayGroup} base` : "",
    description: "",
    groupIds: groups.map((group) => group.id),
    variantIds: variants.map((variant) => variant.id),
    isActive: true,
  };
}

function getSimpleGroupKind(group: CatalogItemOptionGroupRow): SimpleGroupKind {
  const metadata = readGroupMetadata(group.metadata);
  const preset = typeof metadata.preset === "string" ? metadata.preset : "";
  const code = group.code.toLowerCase();
  const name = group.name.toLowerCase();

  if (preset === "extras" || code.includes("extra") || name.includes("extra") || name.includes("adicion")) return "extras";
  if (preset === "replacements" || code.includes("cambio") || code.includes("reemplazo") || name.includes("cambio") || name.includes("reemplazo") || name.includes("sustit")) return "replacements";
  if (preset === "removals" || code.includes("quitar") || name.includes("quitar") || name.includes("sin ")) return "removals";
  if (preset === "recommendations" || name.includes("recomend") || name.includes("tambien") || name.includes("también") || name.includes("sugerir")) return "recommendations";
  if (preset === "preferences" || name.includes("preferencia") || name.includes("instruccion")) return "preferences";
  return "choice";
}

function getSimpleGroupLabel(kind: SimpleGroupKind) {
  switch (kind) {
    case "extras":
      return "Adiciones";
    case "replacements":
      return "Cambios";
    case "removals":
      return "Quitar ingredientes";
    case "preferences":
      return "Preferencias";
    case "recommendations":
      return "Sugerencia de venta";
    case "choice":
    default:
      return "Debe escoger";
  }
}

function getSimpleGroupDisplayName(group: CatalogItemOptionGroupRow) {
  const kind = getSimpleGroupKind(group);
  const name = String(group.name ?? "").trim();
  const normalized = name.toLowerCase();
  if (kind === "recommendations" && (normalized.includes("producto") || normalized.includes("recomend") || normalized.includes("sugerir"))) {
    return "También puedes agregar";
  }
  return name || getSimpleGroupLabel(kind);
}

function getSimpleGroupHelp(kind: SimpleGroupKind) {
  switch (kind) {
    case "extras":
      return "Para queso extra, salsas, leche vegetal, shot adicional o complementos.";
    case "replacements":
      return "Para cambios como leche normal por vegetal, queso estándar por queso premium o ingrediente base por otro insumo.";
    case "removals":
      return "Para opciones como sin cebolla, sin tomate o sin salsa.";
    case "preferences":
      return "Para instrucciones que no cambian inventario: poco dulce, bien caliente o partir en dos.";
    case "recommendations":
      return "Para bebidas, postres o acompañamientos que el cliente puede sumar.";
    case "choice":
    default:
      return "Para tamaño, tipo de leche, bebida o acompañamiento obligatorio.";
  }
}

function parseSelectionType(value: string | null | undefined) {
  return value === "multiple" ? "multiple" : "single";
}

function parseOptionEffectType(value: string | null | undefined) {
  if (value === "additive" || value === "replacement" || value === "removal") return value;
  return "preference";
}

function getSimpleDefaultEffect(kind: SimpleGroupKind) {
  switch (kind) {
    case "extras":
    case "recommendations":
      return "additive";
    case "replacements":
      return "replacement";
    case "removals":
      return "removal";
    case "preferences":
    case "choice":
    default:
      return "preference";
  }
}

function formatCopAdmin(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

function formatQuantityAdmin(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function getOptionSummary(option: CatalogItemOptionRow) {
  const price = Number(option.price_delta_amount ?? 0);
  return price > 0 ? `Suma ${formatCopAdmin(price)}` : "Sin costo adicional";
}

function getSelectionRuleLabel(group: CatalogItemOptionGroupRow) {
  const isMultiple = parseSelectionType(group.selection_type) === "multiple";
  if (group.is_required) return isMultiple ? `Debe escoger entre ${group.min_select} y ${group.max_select}` : "Debe escoger 1";
  return isMultiple ? `Puede escoger hasta ${group.max_select}` : "Puede escoger 1";
}

function getLinkedCatalogItemId(option: CatalogItemOptionRow) {
  const metadata = readGroupMetadata(option.metadata);
  const linkedCatalogItemId = metadata.linked_catalog_item_id;
  return typeof linkedCatalogItemId === "string" && linkedCatalogItemId.trim() ? linkedCatalogItemId.trim() : null;
}

function getOptionIngredientProductId(option: CatalogItemOptionRow) {
  const metadata = readGroupMetadata(option.metadata);
  const ingredientProductId = metadata.ingredient_product_id;
  return typeof ingredientProductId === "string" && ingredientProductId.trim() ? ingredientProductId.trim() : null;
}

function normalizeOptionName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^sin\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findVisualAssetForOption(option: CatalogItemOptionRow, assets: CatalogOptionVisualAssetRow[]) {
  const ingredientProductId = getOptionIngredientProductId(option);
  const normalizedName = normalizeOptionName(option.name);

  return (
    assets.find((asset) => asset.id === getMetadataText(option.metadata, "visual_asset_id")) ||
    assets.find((asset) => option.product_id && asset.linked_product_id === option.product_id) ||
    assets.find((asset) => ingredientProductId && asset.linked_ingredient_product_id === ingredientProductId) ||
    assets.find((asset) => asset.option_code && asset.option_code === option.code) ||
    assets.find((asset) => asset.normalized_option_name && asset.normalized_option_name === normalizedName) ||
    null
  );
}

function getOptionImageUrl(option: CatalogItemOptionRow, assets: CatalogOptionVisualAssetRow[]) {
  return option.image_url || findVisualAssetForOption(option, assets)?.image_url || null;
}

function getLinkedCatalogItemImageUrl(
  option: CatalogItemOptionRow,
  linkedCatalogItemsById: Map<string, CommercialCatalogItemOptionRow>,
) {
  const linkedItemId = getLinkedCatalogItemId(option);
  const linkedItem = linkedItemId ? linkedCatalogItemsById.get(linkedItemId) : null;
  return linkedItem?.image_url || null;
}

function getOptionDisplayName(option: CatalogItemOptionRow, linkedCatalogItemsById: Map<string, CommercialCatalogItemOptionRow>) {
  const linkedItemId = getLinkedCatalogItemId(option);
  const linkedItem = linkedItemId ? linkedCatalogItemsById.get(linkedItemId) : null;
  return linkedItem?.name || option.name;
}

function getOptionDisplayCategory(option: CatalogItemOptionRow, linkedCatalogItemsById: Map<string, CommercialCatalogItemOptionRow>) {
  const linkedItemId = getLinkedCatalogItemId(option);
  const linkedItem = linkedItemId ? linkedCatalogItemsById.get(linkedItemId) : null;
  return linkedItem?.category_label || option.description || "";
}

function formString(form: HTMLFormElement, name: string) {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value.trim() : "";
}

function formNumber(form: HTMLFormElement, name: string, fallback = 0) {
  const parsed = Number(formString(form, name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formBool(form: HTMLFormElement, name: string) {
  return new FormData(form).get(name) === "on";
}

export function MenuPersonalizationsClient({
  itemId,
  initialSnapshot,
}: {
  itemId: string;
  initialSnapshot: PersonalizationSnapshot;
}) {
  const [snapshot, setSnapshot] = useState<PersonalizationSnapshot>(initialSnapshot);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [openDetailsKey, setOpenDetailsKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [uploadingOptionId, setUploadingOptionId] = useState<string | null>(null);

  const currentDisplayGroup = getCurrentDisplayGroup(snapshot.currentItem);
  const visualVariants = snapshot.visualVariants ?? [];
  const sharedTemplates = snapshot.sharedTemplates ?? [];
  const sharedTemplateGroups = snapshot.sharedTemplateGroups ?? [];
  const sharedTemplateAssignments = snapshot.sharedTemplateAssignments ?? [];

  const [newSharedTemplateDraft, setNewSharedTemplateDraft] = useState<SharedTemplateDraft>(() =>
    getDefaultSharedTemplateDraft(
      getCurrentDisplayGroup(initialSnapshot.currentItem),
      initialSnapshot.optionGroups.filter((group) => group.is_active),
      initialSnapshot.visualVariants ?? [],
    ),
  );
  const [sharedTemplateDrafts, setSharedTemplateDrafts] = useState<Record<string, SharedTemplateDraft>>({});

  const visibleOptionGroups = useMemo(() => snapshot.optionGroups.filter((group) => group.is_active), [snapshot.optionGroups]);
  const visibleOptionGroupIds = useMemo(() => new Set(visibleOptionGroups.map((group) => group.id)), [visibleOptionGroups]);
  const activeOptionCount = snapshot.options.filter((option) => option.is_active && visibleOptionGroupIds.has(option.option_group_id)).length;
  const hasVisibleRemovalsGroup = visibleOptionGroups.some((group) => getSimpleGroupKind(group) === "removals");

  const optionsByGroup = useMemo(() => {
    const map = new Map<string, CatalogItemOptionRow[]>();
    for (const option of snapshot.options) {
      const current = map.get(option.option_group_id) ?? [];
      current.push(option);
      map.set(option.option_group_id, current);
    }
    return map;
  }, [snapshot.options]);

  const consumptionRulesByOption = useMemo(() => {
    const map = new Map<string, CatalogItemOptionConsumptionRuleRow[]>();
    for (const rule of snapshot.consumptionRules) {
      const current = map.get(rule.option_id) ?? [];
      current.push(rule);
      map.set(rule.option_id, current);
    }
    return map;
  }, [snapshot.consumptionRules]);

  const recipeEffectsByOption = useMemo(() => {
    const map = new Map<string, CatalogItemOptionRecipeEffectRow[]>();
    for (const effect of snapshot.recipeEffects) {
      const current = map.get(effect.option_id) ?? [];
      current.push(effect);
      map.set(effect.option_id, current);
    }
    return map;
  }, [snapshot.recipeEffects]);

  const consumptionProductById = useMemo(() => new Map(snapshot.consumptionProducts.map((product) => [product.id, product])), [snapshot.consumptionProducts]);
  const commercialCatalogItemsById = useMemo(() => new Map(snapshot.commercialCatalogItems.map((item) => [item.id, item])), [snapshot.commercialCatalogItems]);
  const groupedCommercialCatalogItems = useMemo(
    () => buildCommercialCatalogGroups(snapshot.commercialCatalogItems),
    [snapshot.commercialCatalogItems],
  );
  const groupedOperationalCommercialCatalogItems = useMemo(
    () => buildCommercialCatalogGroups(snapshot.commercialCatalogItems.filter((catalogItem) => catalogItem.product_id)),
    [snapshot.commercialCatalogItems],
  );

  const sharedTemplateGroupsByTemplate = useMemo(() => {
    const map = new Map<string, SharedCustomizationTemplateGroupRow[]>();
    for (const entry of sharedTemplateGroups) {
      const current = map.get(entry.template_id) ?? [];
      current.push(entry);
      map.set(entry.template_id, current);
    }
    return map;
  }, [sharedTemplateGroups]);

  const sharedTemplateAssignmentsByTemplate = useMemo(() => {
    const map = new Map<string, SharedCustomizationTemplateAssignmentRow[]>();
    for (const entry of sharedTemplateAssignments) {
      const current = map.get(entry.template_id) ?? [];
      current.push(entry);
      map.set(entry.template_id, current);
    }
    return map;
  }, [sharedTemplateAssignments]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNewSharedTemplateDraft((current) => {
        const defaultName = currentDisplayGroup ? `${currentDisplayGroup} base` : "";
        const allGroupIds = visibleOptionGroups.map((group) => group.id);
        const allVariantIds = visualVariants.map((variant) => variant.id);
        const currentGroupIds = current.groupIds.filter((id) => allGroupIds.includes(id));
        const currentVariantIds = current.variantIds.filter((id) => allVariantIds.includes(id));
  
        return {
          name: current.name || defaultName,
          description: current.description,
          groupIds: currentGroupIds.length > 0
            ? Array.from(new Set([...currentGroupIds, ...allGroupIds]))
            : allGroupIds,
          variantIds: currentVariantIds.length > 0 ? currentVariantIds : allVariantIds,
          isActive: true,
        };
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentDisplayGroup, visibleOptionGroups, visualVariants]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nextDrafts: Record<string, SharedTemplateDraft> = {};
  
      for (const template of sharedTemplates) {
        const templateGroups = sharedTemplateGroupsByTemplate.get(template.id) ?? [];
        const templateAssignments = sharedTemplateAssignmentsByTemplate.get(template.id) ?? [];
  
        nextDrafts[template.id] = {
          name: template.name,
          description: template.description ?? "",
          groupIds: templateGroups.filter((entry) => entry.is_active).map((entry) => entry.option_group_id),
          variantIds: templateAssignments.filter((entry) => entry.is_active).map((entry) => entry.catalog_item_id),
          isActive: template.is_active,
        };
      }
  
      setSharedTemplateDrafts(nextDrafts);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sharedTemplates, sharedTemplateGroupsByTemplate, sharedTemplateAssignmentsByTemplate]);

  async function mutate(
    action: string,
    payload: JsonRecord,
    successFallback: string,
    options?: {
      pendingKey?: string;
      closeDetailsKey?: string;
      resetForm?: HTMLFormElement;
    },
  ) {
    const nextPendingKey = options?.pendingKey ?? action;
    setPendingKey(nextPendingKey);
    setNotice(null);

    try {
      const response = await fetch(`/menu/${itemId}/personalizaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const data = (await response.json()) as MutationResponse;

      if (!response.ok || !data.ok || !data.snapshot) {
        throw new Error(data.error || "No se pudo guardar la personalización.");
      }

      setSnapshot(data.snapshot);
      setNotice({ type: "success", message: data.message || successFallback });

      if (options?.resetForm) {
        options.resetForm.reset();
      }

      if (options?.closeDetailsKey) {
        setOpenDetailsKey((current) => (current === options.closeDetailsKey ? null : current));
      }

      return true;
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Error inesperado." });
      return false;
    } finally {
      setPendingKey((current) => (current === nextPendingKey ? null : current));
    }
  }

  function updateDetailsState(key: string, isOpen: boolean) {
    setOpenDetailsKey((current) => {
      if (isOpen) return key;
      return current === key ? null : current;
    });
  }

  function handleCreateGroup(type: PersonalizationTypeCard) {
    const detailsKey = `create-group:${type.kind}`;
    void mutate(
      "create_group",
      { groupKind: type.kind, name: type.defaultName, description: type.description, maxSelect: type.maxSelect ? Number(type.maxSelect) : null },
      "Grupo creado.",
      { pendingKey: detailsKey },
    );
  }

  function handleUpdateGroup(event: FormEvent<HTMLFormElement>, group: CatalogItemOptionGroupRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const detailsKey = `edit-group:${group.id}`;
    void mutate(
      "update_group",
      {
        groupId: group.id,
        name: formString(form, "name"),
        description: formString(form, "description"),
        selectionType: formString(form, "selection_type"),
        minSelect: formNumber(form, "min_select", 0),
        maxSelect: formNumber(form, "max_select", 1),
        isRequired: formBool(form, "is_required"),
        isActive: true,
        sortOrder: group.sort_order ?? 0,
        code: group.code,
      },
      "Grupo actualizado.",
      { pendingKey: detailsKey, closeDetailsKey: detailsKey },
    );
  }

  function handleCreateOption(event: FormEvent<HTMLFormElement>, group: CatalogItemOptionGroupRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const detailsKey = `add-option:${group.id}`;
    void mutate(
      "create_option",
      {
        groupId: group.id,
        name: formString(form, "name"),
        description: formString(form, "description"),
        priceDeltaAmount: formNumber(form, "price_delta_amount", 0),
        linkedCatalogItemId: formString(form, "linked_catalog_item_id"),
        optionProductId: formString(form, "option_product_id"),
        optionQuantityPerOption: formNumber(form, "option_quantity_per_option", 0),
        optionStockUnitCode: formString(form, "option_stock_unit_code"),
        replacementTargetIngredientProductId: formString(form, "replacement_target_ingredient_product_id"),
        isDefault: formBool(form, "is_default"),
      },
      "Opción creada y mapeada.",
      { pendingKey: detailsKey, resetForm: form },
    );
  }

  function handleUpdateOption(event: FormEvent<HTMLFormElement>, option: CatalogItemOptionRow, group: CatalogItemOptionGroupRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const detailsKey = `edit-option:${option.id}`;
    void mutate(
      "update_option",
      {
        groupId: group.id,
        optionId: option.id,
        name: formString(form, "name"),
        description: formString(form, "description"),
        priceDeltaAmount: formNumber(form, "price_delta_amount", 0),
        effectType: parseOptionEffectType(option.effect_type),
        isDefault: formBool(form, "is_default"),
        isActive: true,
        sortOrder: option.sort_order ?? 0,
        code: option.code,
      },
      "Opción actualizada.",
      { pendingKey: detailsKey, closeDetailsKey: detailsKey },
    );
  }

  async function handleOptionImageUpload(file: File | null, option: CatalogItemOptionRow, group: CatalogItemOptionGroupRow) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setNotice({ type: "error", message: "La imagen no puede superar 5 MB." });
      return;
    }

    setUploadingOptionId(option.id);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "option-asset");
      formData.append("ownerId", option.product_id || getOptionIngredientProductId(option) || option.id);

      const response = await fetch(MENU_IMAGE_UPLOAD_ENDPOINT, { method: "POST", body: formData });
      const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || "No se pudo subir la imagen.");
      }

      await mutate(
        "update_option_visual_asset",
        { groupId: group.id, optionId: option.id, imageUrl: data.url },
        "Imagen comercial guardada.",
        { pendingKey: `visual-option:${option.id}` },
      );
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "No se pudo subir la imagen." });
    } finally {
      setUploadingOptionId((current) => (current === option.id ? null : current));
    }
  }

  function handleRemoveOptionImage(option: CatalogItemOptionRow, group: CatalogItemOptionGroupRow) {
    void mutate(
      "update_option_visual_asset",
      { groupId: group.id, optionId: option.id, imageUrl: null },
      "Imagen comercial quitada.",
      { pendingKey: `visual-option:${option.id}` },
    );
  }

  function handleCreateConsumptionRule(event: FormEvent<HTMLFormElement>, option: CatalogItemOptionRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const detailsKey = `inventory-option:${option.id}`;
    void mutate(
      "create_consumption_rule",
      {
        optionId: option.id,
        productId: formString(form, "product_id"),
        quantityPerOption: formNumber(form, "quantity_per_option", 0),
        stockUnitCode: formString(form, "stock_unit_code"),
        effectType: parseOptionEffectType(option.effect_type) === "replacement" ? "replacement" : "additive",
      },
      "Regla de consumo creada.",
      { pendingKey: detailsKey, closeDetailsKey: detailsKey, resetForm: form },
    );
  }

  function handleCreateRecipeEffect(event: FormEvent<HTMLFormElement>, option: CatalogItemOptionRow) {
    event.preventDefault();
    const form = event.currentTarget;
    const detailsKey = `inventory-option:${option.id}`;
    void mutate(
      "create_recipe_effect",
      {
        optionId: option.id,
        targetIngredientProductId: formString(form, "target_ingredient_product_id"),
        effectType: "replacement",
      },
      "Efecto de receta creado.",
      { pendingKey: detailsKey, closeDetailsKey: detailsKey, resetForm: form },
    );
  }

  function updateNewSharedTemplateDraft(patch: Partial<SharedTemplateDraft>) {
    setNewSharedTemplateDraft((current) => ({ ...current, ...patch }));
  }

  function updateSharedTemplateDraft(templateId: string, patch: Partial<SharedTemplateDraft>) {
    setSharedTemplateDrafts((current) => ({
      ...current,
      [templateId]: {
        ...(current[templateId] ?? {
          name: "",
          description: "",
          groupIds: [],
          variantIds: [],
          isActive: true,
        }),
        ...patch,
      },
    }));
  }

  function handleCreateSharedTemplate() {
    void mutate(
      "create_shared_template",
      {
        name: newSharedTemplateDraft.name,
        description: newSharedTemplateDraft.description,
        groupIds: newSharedTemplateDraft.groupIds,
        variantIds: newSharedTemplateDraft.variantIds,
      },
      "Plantilla compartida creada.",
      { pendingKey: "create-shared-template" },
    );
  }

  function handleUpdateSharedTemplate(template: SharedCustomizationTemplateRow) {
    const draft = sharedTemplateDrafts[template.id];
    if (!draft) return;

    void mutate(
      "update_shared_template",
      {
        templateId: template.id,
        name: draft.name,
        description: draft.description,
        groupIds: draft.groupIds,
        variantIds: draft.variantIds,
        managedGroupIds: visibleOptionGroups.map((group) => group.id),
        managedVariantIds: visualVariants.map((variant) => variant.id),
        isActive: draft.isActive,
      },
      "Plantilla compartida actualizada.",
      { pendingKey: `update-shared-template:${template.id}` },
    );
  }

  return (
    <>
      <div id="personalizaciones" className="ui-panel space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ui-h3">2. Personalizaciones</div>
            <p className="ui-caption">Crea preguntas y opciones. El inventario se configura solo dentro de la opción que lo necesite.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="ui-chip ui-chip--brand">{visibleOptionGroups.length} personalización{visibleOptionGroups.length === 1 ? "" : "es"}</span>
            <span className="ui-chip">{activeOptionCount} opción{activeOptionCount === 1 ? "" : "es"}</span>
          </div>
        </div>

        {notice ? (
          <div className={notice.type === "error" ? "ui-alert ui-alert--error" : "ui-alert ui-alert--success"}>{notice.message}</div>
        ) : null}

        <details className="rounded-[28px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4" open={visibleOptionGroups.length === 0}>
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-base font-black text-[var(--ui-text)]">+ Agregar personalización</div>
              <span className="ui-chip">Tamaño · Cambios · Ingredientes · Extras · Preferencias · Sugerir producto</span>
            </div>
          </summary>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {personalizationTypeCards.map((type) => (
              <button
                key={type.kind}
                type="button"
                disabled={pendingKey === `create-group:${type.kind}`}
                onClick={() => handleCreateGroup(type)}
                className="flex min-h-24 w-full flex-col justify-between rounded-2xl border border-[var(--ui-border)] bg-white p-4 text-left shadow-[var(--ui-shadow-1)] transition hover:-translate-y-0.5 hover:shadow-[var(--ui-shadow-2)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-base font-black text-[var(--ui-brand)]">{type.label}</span>
                <span className="mt-2 text-xs font-semibold leading-4 text-[var(--ui-muted)]">{type.description}</span>
              </button>
            ))}
          </div>
        </details>

        {visibleOptionGroups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--ui-border)] bg-white p-6 text-center">
            <div className="text-base font-black text-[var(--ui-text)]">Este producto todavía no tiene personalizaciones.</div>
            <p className="ui-caption mt-1">Pulsa “Agregar personalización” y elige un tipo para empezar.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleOptionGroups.map((group, groupIndex) => {
              const groupOptions = optionsByGroup.get(group.id) ?? [];
              const visibleOptions = groupOptions.filter((option) => option.is_active);
              const groupKind = getSimpleGroupKind(group);
              const supportsDefaultOption = groupKind === "choice";
              const isMultiple = parseSelectionType(group.selection_type) === "multiple";
              const groupDisplayName = getSimpleGroupDisplayName(group);
              const groupEditKey = `edit-group:${group.id}`;
              const addOptionKey = `add-option:${group.id}`;
              const shouldOpenAddOption = openDetailsKey === addOptionKey || (visibleOptions.length === 0 && openDetailsKey === null);

              return (
                <div key={group.id} className="overflow-hidden rounded-[30px] border border-[var(--ui-border)] bg-white shadow-[var(--ui-shadow-1)]">
                  <div className="border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-sm font-black text-white">{groupIndex + 1}</span>
                        <div className="min-w-0">
                          <div className="truncate text-lg font-black text-[var(--ui-text)]">{groupDisplayName}</div>
                          <div className="ui-caption mt-1" title={getSimpleGroupHelp(groupKind)}>{getSimpleGroupLabel(groupKind)}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="ui-chip">Selección: {isMultiple ? "Múltiple" : "Única"}</span>
                        <span className="ui-chip" title={getSelectionRuleLabel(group)}>Requerido: {group.is_required ? "Sí" : "No"}</span>
                        <button
                          type="button"
                          className="ui-btn ui-btn--danger"
                          disabled={pendingKey === `disable-group:${group.id}`}
                          onClick={() => void mutate("disable_group", { groupId: group.id }, "Grupo desactivado.", { pendingKey: `disable-group:${group.id}` })}
                        >
                          {pendingKey === `disable-group:${group.id}` ? "Eliminando..." : "Eliminar"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-[var(--ui-border)]">
                    <details
                      className="px-5 py-4"
                      open={openDetailsKey === groupEditKey}
                      onToggle={(event) => updateDetailsState(groupEditKey, event.currentTarget.open)}
                    >
                      <summary className="cursor-pointer list-none text-sm font-black text-[var(--ui-brand)]">Editar nombre y reglas</summary>
                      <form onSubmit={(event) => handleUpdateGroup(event, group)} className="mt-4 space-y-4 rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                        <div className="grid gap-3 lg:grid-cols-[1fr_180px_120px_120px]">
                          <label className="space-y-2">
                            <span className="ui-label">Nombre de la personalización</span>
                            <input name="name" className="ui-input" defaultValue={groupDisplayName} required />
                          </label>

                          <label className="space-y-2">
                            <span className="ui-label">Selección</span>
                            <select name="selection_type" className="ui-input" defaultValue={group.selection_type}>
                              <option value="single">Única</option>
                              <option value="multiple">Múltiple</option>
                            </select>
                          </label>

                          <label className="space-y-2">
                            <span className="ui-label">Mínimo</span>
                            <input name="min_select" type="number" min="0" className="ui-input" defaultValue={String(group.min_select ?? 0)} />
                          </label>

                          <label className="space-y-2">
                            <span className="ui-label">Máximo</span>
                            <input name="max_select" type="number" min="1" className="ui-input" defaultValue={String(group.max_select ?? 1)} />
                          </label>
                        </div>

                        <label className="block space-y-2">
                          <span className="ui-label">Texto de ayuda</span>
                          <input name="description" className="ui-input" defaultValue={group.description ?? ""} />
                        </label>

                        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                          <input type="checkbox" name="is_required" defaultChecked={group.is_required} />
                          Requerido para comprar
                        </label>

                        <div className="flex justify-end">
                          <button type="submit" className="ui-btn ui-btn--brand" disabled={pendingKey === groupEditKey}>
                            {pendingKey === groupEditKey ? "Guardando..." : "Guardar"}
                          </button>
                        </div>
                      </form>
                    </details>

                    {groupKind === "removals" ? (
                      <div className="space-y-4 px-5 py-5">
                        <div>
                          <div className="text-sm font-black text-[var(--ui-text)]">Ingredientes de la receta</div>
                          <p className="ui-caption mt-1">Activa los ingredientes que el cliente puede pedir “sin”. Si el cliente marca uno en Pass, cocina lo retira y ese ingrediente no se descuenta de inventario.</p>
                        </div>

                        {snapshot.recipeIngredients.length === 0 ? (
                          <div className="rounded-3xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-5 text-center">
                            <div className="text-sm font-black text-[var(--ui-text)]">Este producto base no tiene receta activa.</div>
                            <p className="ui-caption mt-1">Primero configura la receta operacional para poder activar ingredientes removibles.</p>
                          </div>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {snapshot.recipeIngredients.map((ingredient) => {
                              const product = ingredient.product;
                              if (!product) return null;
                              const ingredientName = product.name ?? "Ingrediente";
                              const removalOption = visibleOptions.find((option) => {
                                const ingredientProductId = getOptionIngredientProductId(option);
                                return ingredientProductId === ingredient.ingredient_product_id || option.code === `sin-${ingredientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                              });

                              if (removalOption) {
                                return (
                                  <div key={ingredient.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-white p-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-black text-[var(--ui-text)]">Sin {ingredientName}</div>
                                      <div className="ui-caption">No descuenta {formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}</div>
                                    </div>
                                    <button
                                      type="button"
                                      className="ui-btn ui-btn--ghost"
                                      disabled={pendingKey === `disable-option:${removalOption.id}`}
                                      onClick={() => void mutate("disable_option", { groupId: group.id, optionId: removalOption.id }, "Opción desactivada.", { pendingKey: `disable-option:${removalOption.id}` })}
                                    >
                                      {pendingKey === `disable-option:${removalOption.id}` ? "Quitando..." : "Quitar"}
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <button
                                  key={ingredient.id}
                                  type="button"
                                  disabled={pendingKey === `create-removal:${ingredient.id}`}
                                  onClick={() => void mutate("create_removal_option_from_recipe", { groupId: group.id, ingredientProductId: ingredient.ingredient_product_id, ingredientName, stockUnitCode: product.stock_unit_code || product.unit || "" }, `Opción Sin ${ingredientName} creada.`, { pendingKey: `create-removal:${ingredient.id}` })}
                                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-black text-[var(--ui-text)]">Sin {ingredientName}</span>
                                    <span className="ui-caption">Receta: {formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}</span>
                                  </span>
                                  <span className="ui-btn ui-btn--brand shrink-0">Permitir quitar</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {groupKind === "removals" ? null : visibleOptions.length === 0 ? (
                      <div className="px-5 py-5">
                        <div className="rounded-3xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-5 text-center">
                          <div className="text-sm font-black text-[var(--ui-text)]">Aún no tiene opciones.</div>
                          <p className="ui-caption mt-1">Agrega la primera opción abajo.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--ui-border)]">
                        {visibleOptions.map((option) => {
                          const consumptionRules = consumptionRulesByOption.get(option.id) ?? [];
                          const recipeEffects = recipeEffectsByOption.get(option.id) ?? [];
                          const currentEffectType = parseOptionEffectType(option.effect_type);
                          const optionName = getOptionDisplayName(option, commercialCatalogItemsById);
                          const optionMeta = getOptionDisplayCategory(option, commercialCatalogItemsById);
                          const optionPrice = Number(option.price_delta_amount ?? 0);
                          const hasOperationalRules = consumptionRules.length > 0 || recipeEffects.length > 0;
                          const optionImageUrl =
                            getOptionImageUrl(option, snapshot.visualAssets) ||
                            getLinkedCatalogItemImageUrl(option, commercialCatalogItemsById);
                          const optionEditKey = `edit-option:${option.id}`;
                          const optionInventoryKey = `inventory-option:${option.id}`;

                          return (
                            <div key={option.id} className="px-5 py-4">
                              <div className="grid gap-3 lg:grid-cols-[56px_minmax(0,1fr)_150px_auto] lg:items-center">
                                <div className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
                                  {optionImageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={optionImageUrl} alt={optionName} className="aspect-square w-full object-cover" />
                                  ) : (
                                    <div className="flex aspect-square w-full items-center justify-center text-[10px] font-black text-[var(--ui-muted)]">
                                      IMG
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-base font-black text-[var(--ui-text)]">{optionName}</div>
                                    {supportsDefaultOption && option.is_default ? <span className="ui-chip ui-chip--success">Estándar</span> : null}
                                  </div>
                                  {optionMeta ? <div className="ui-caption mt-1 truncate">{optionMeta}</div> : null}
                                </div>

                                <div className="rounded-2xl bg-[var(--ui-surface-2)] px-3 py-2 text-sm font-black text-[var(--ui-text)]" title={getOptionSummary(option)}>
                                  {optionPrice > 0 ? `+ ${formatCopAdmin(optionPrice)}` : "+ $0"}
                                </div>

                                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                                  <details
                                    className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2"
                                    open={openDetailsKey === optionEditKey}
                                    onToggle={(event) => updateDetailsState(optionEditKey, event.currentTarget.open)}
                                  >
                                    <summary className="cursor-pointer list-none text-sm font-black text-[var(--ui-text)]">Editar</summary>
                                    <form onSubmit={(event) => handleUpdateOption(event, option, group)} className="mt-4 w-full min-w-[280px] space-y-3">
                                      <label className="space-y-2">
                                        <span className="ui-label">Nombre</span>
                                        <input name="name" className="ui-input" defaultValue={option.name} required />
                                      </label>
                                      <label className="space-y-2">
                                        <span className="ui-label">Precio adicional</span>
                                        <input name="price_delta_amount" type="number" min="0" className="ui-input" defaultValue={String(option.price_delta_amount ?? 0)} />
                                      </label>
                                      <label className="space-y-2">
                                        <span className="ui-label">Descripción</span>
                                        <input name="description" className="ui-input" defaultValue={option.description ?? ""} />
                                      </label>
                                      {supportsDefaultOption ? (
                                        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                                          <input type="checkbox" name="is_default" defaultChecked={option.is_default} />
                                          Opción estándar
                                        </label>
                                      ) : (
                                        <input type="hidden" name="is_default" value="false" />
                                      )}
                                      <button type="submit" className="ui-btn ui-btn--brand w-full" disabled={pendingKey === optionEditKey}>
                                        {pendingKey === optionEditKey ? "Guardando..." : "Guardar opción"}
                                      </button>
                                    </form>
                                  </details>

                                  <details className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2">
                                    <summary className="cursor-pointer list-none text-sm font-black text-[var(--ui-text)]">Imagen</summary>
                                    <div className="mt-4 w-full min-w-[280px] space-y-3">
                                      <div className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-white">
                                        {optionImageUrl ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={optionImageUrl} alt={optionName} className="aspect-video w-full object-cover" />
                                        ) : (
                                          <div className="flex aspect-video w-full items-center justify-center bg-white text-sm font-black text-[var(--ui-muted)]">
                                            Sin imagen comercial
                                          </div>
                                        )}
                                      </div>
                                      <label className="block space-y-2">
                                        <span className="ui-label">{optionImageUrl ? "Reemplazar imagen" : "Subir imagen"}</span>
                                        <input
                                          type="file"
                                          accept="image/jpeg,image/png,image/webp"
                                          className="ui-input"
                                          disabled={uploadingOptionId === option.id || pendingKey === `visual-option:${option.id}`}
                                          onChange={(event) => void handleOptionImageUpload(event.target.files?.[0] ?? null, option, group)}
                                        />
                                      </label>
                                      <p className="ui-caption">Se optimiza a WebP y se reutiliza para opciones con el mismo insumo o codigo.</p>
                                      {optionImageUrl ? (
                                        <button
                                          type="button"
                                          className="ui-btn ui-btn--ghost w-full"
                                          disabled={pendingKey === `visual-option:${option.id}`}
                                          onClick={() => handleRemoveOptionImage(option, group)}
                                        >
                                          Quitar imagen
                                        </button>
                                      ) : null}
                                    </div>
                                  </details>

                                  <details
                                    className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2"
                                    open={openDetailsKey === optionInventoryKey}
                                    onToggle={(event) => updateDetailsState(optionInventoryKey, event.currentTarget.open)}
                                  >
                                    <summary className="cursor-pointer list-none text-sm font-black text-[var(--ui-text)]">{hasOperationalRules ? "Inventario listo" : "Inventario"}</summary>
                                    <div className="mt-4 w-full min-w-[320px] space-y-4">
                                      <form onSubmit={(event) => handleCreateConsumptionRule(event, option)} className="space-y-3 rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                        <div className="text-sm font-black text-[var(--ui-text)]">Descontar insumo</div>
                                        <div className="grid gap-3 lg:grid-cols-[1fr_120px_140px]">
                                          <label className="space-y-2">
                                            <span className="ui-label">Insumo</span>
                                            <select name="product_id" className="ui-input" required>
                                              <option value="">Selecciona</option>
                                              {snapshot.consumptionProducts.map((product) => (
                                                <option key={product.id} value={product.id}>{product.name ?? "Sin nombre"}</option>
                                              ))}
                                            </select>
                                          </label>
                                          <label className="space-y-2">
                                            <span className="ui-label">Cantidad</span>
                                            <input name="quantity_per_option" type="number" min="0.0001" step="0.0001" className="ui-input" required />
                                          </label>
                                          <label className="space-y-2">
                                            <span className="ui-label">Unidad</span>
                                            <select name="stock_unit_code" className="ui-input" defaultValue="">
                                              <option value="">Auto</option>
                                              {snapshot.inventoryUnits.map((unit) => (
                                                <option key={unit.code} value={unit.code}>{unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}</option>
                                              ))}
                                            </select>
                                          </label>
                                        </div>
                                        <button type="submit" className="ui-btn ui-btn--brand w-full" disabled={pendingKey === optionInventoryKey}>
                                          {pendingKey === optionInventoryKey ? "Guardando..." : "Guardar consumo"}
                                        </button>
                                      </form>

                                      {consumptionRules.length > 0 ? (
                                        <div className="space-y-2">
                                          {consumptionRules.map((rule) => {
                                            const product = consumptionProductById.get(rule.product_id);
                                            return (
                                              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-white p-3">
                                                <div className="text-sm font-semibold text-[var(--ui-text)]">
                                                  {product?.name ?? "Insumo"} · {formatQuantityAdmin(rule.quantity_per_option)} {rule.stock_unit_code || product?.stock_unit_code || product?.unit || "unidad"}
                                                </div>
                                                <button
                                                  type="button"
                                                  className="ui-btn ui-btn--ghost"
                                                  disabled={pendingKey === `disable-consumption:${rule.id}`}
                                                  onClick={() => void mutate("disable_consumption_rule", { optionId: option.id, ruleId: rule.id }, "Regla de consumo desactivada.", { pendingKey: `disable-consumption:${rule.id}` })}
                                                >
                                                  {pendingKey === `disable-consumption:${rule.id}` ? "Quitando..." : "Quitar"}
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : null}

                                      {snapshot.recipeIngredients.length > 0 ? (
                                        <form onSubmit={(event) => handleCreateRecipeEffect(event, option)} className="space-y-3 rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                          <div className="text-sm font-black text-[var(--ui-text)]">Reemplazar ingrediente</div>
                                          <label className="space-y-2">
                                            <span className="ui-label">Ingrediente de receta que deja de descontarse</span>
                                            <select name="target_ingredient_product_id" className="ui-input" required>
                                              <option value="">Selecciona ingrediente</option>
                                              {snapshot.recipeIngredients.map((ingredient) => {
                                                const product = ingredient.product;
                                                if (!product) return null;
                                                return (
                                                  <option key={ingredient.id} value={ingredient.ingredient_product_id}>
                                                    {product.name ?? "Ingrediente"} · {formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}
                                                  </option>
                                                );
                                              })}
                                            </select>
                                          </label>
                                          <button type="submit" className="ui-btn ui-btn--brand w-full" disabled={pendingKey === optionInventoryKey}>
                                            {pendingKey === optionInventoryKey ? "Guardando..." : "Guardar reemplazo"}
                                          </button>
                                        </form>
                                      ) : null}

                                      {recipeEffects.length > 0 ? (
                                        <div className="space-y-2">
                                          {recipeEffects.map((effect) => {
                                            const targetProduct = consumptionProductById.get(effect.target_ingredient_product_id);
                                            return (
                                              <div key={effect.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-white p-3">
                                                <div className="text-sm font-semibold text-[var(--ui-text)]">{effect.effect_type === "replacement" ? "Reemplaza" : "Quita"} {targetProduct?.name ?? "ingrediente"}</div>
                                                <button
                                                  type="button"
                                                  className="ui-btn ui-btn--ghost"
                                                  disabled={pendingKey === `disable-recipe-effect:${effect.id}`}
                                                  onClick={() => void mutate("disable_recipe_effect", { optionId: option.id, effectId: effect.id }, "Efecto de receta desactivado.", { pendingKey: `disable-recipe-effect:${effect.id}` })}
                                                >
                                                  {pendingKey === `disable-recipe-effect:${effect.id}` ? "Quitando..." : "Quitar"}
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : null}
                                    </div>
                                  </details>

                                  <button
                                    type="button"
                                    className="ui-btn ui-btn--ghost"
                                    disabled={pendingKey === `disable-option:${option.id}`}
                                    onClick={() => void mutate("disable_option", { groupId: group.id, optionId: option.id }, "Opción desactivada.", { pendingKey: `disable-option:${option.id}` })}
                                  >
                                    {pendingKey === `disable-option:${option.id}` ? "Eliminando..." : "Eliminar"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {groupKind === "removals" ? null : (
                      <details
                        className="px-5 py-4"
                        open={shouldOpenAddOption}
                        onToggle={(event) => updateDetailsState(addOptionKey, event.currentTarget.open)}
                      >
                        <summary className="cursor-pointer list-none text-sm font-black text-[var(--ui-brand)]">+ Agregar opción</summary>
                        <form onSubmit={(event) => handleCreateOption(event, group)} className="mt-4 rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                          {groupKind === "recommendations" ? (
                            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                              <label className="space-y-2">
                                <span className="ui-label">Producto sugerido</span>
                                <select name="linked_catalog_item_id" className="ui-input" required>
                                  <option value="">Selecciona producto sugerido</option>
                                  {groupedCommercialCatalogItems.map((collection) =>
                                    collection.categories.map((category) => (
                                      <optgroup key={`${collection.key}:${category.key}`} label={`${collection.label} / ${category.label}`}>
                                        {category.items.map((catalogItem) => (
                                          <option key={catalogItem.id} value={catalogItem.id}>{catalogItem.name || "Producto sin nombre"} · {formatCopAdmin(catalogItem.price_amount)}</option>
                                        ))}
                                      </optgroup>
                                    )),
                                  )}
                                </select>
                              </label>
                              <label className="space-y-2">
                                <span className="ui-label">Texto opcional</span>
                                <input name="description" className="ui-input" placeholder="Ej. Queda bien con este producto." />
                              </label>
                              <button type="submit" className="ui-btn ui-btn--brand" disabled={pendingKey === addOptionKey}>
                                {pendingKey === addOptionKey ? "Agregando..." : "Agregar sugerencia"}
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                <label className="space-y-2">
                                  <span className="ui-label">Usar producto comercial existente</span>
                                  <select name="linked_catalog_item_id" className="ui-input" defaultValue="">
                                    <option value="">No usar producto comercial existente</option>
                                    {groupedOperationalCommercialCatalogItems.map((collection) =>
                                      collection.categories.map((category) => (
                                        <optgroup key={`${collection.key}:${category.key}`} label={`${collection.label} / ${category.label}`}>
                                          {category.items.map((catalogItem) => (
                                            <option key={catalogItem.id} value={catalogItem.id}>
                                              {catalogItem.name || "Producto sin nombre"} · {formatCopAdmin(catalogItem.price_amount)}
                                            </option>
                                          ))}
                                        </optgroup>
                                      )),
                                    )}
                                  </select>
                                </label>
                                <p className="ui-caption mt-2">
                                  Si eliges uno, Viso queda vinculado a ese comercial: toma nombre e imagen en vivo y usa su producto operativo para descontar inventario. El precio adicional queda en 0 salvo que lo cambies.
                                </p>
                              </div>
                              <div className="grid gap-3 lg:grid-cols-[1fr_160px_1fr_auto] lg:items-end">
                                <label className="space-y-2">
                                  <span className="ui-label">Opción visible</span>
                                  <input name="name" className="ui-input" placeholder="Déjalo vacío si usas un producto comercial" />
                                </label>
                                <label className="space-y-2">
                                  <span className="ui-label">Precio adicional</span>
                                  <input name="price_delta_amount" type="number" min="0" className="ui-input" defaultValue="0" />
                                </label>
                                <label className="space-y-2">
                                  <span className="ui-label">Descripción</span>
                                  <input name="description" className="ui-input" placeholder="Opcional" />
                                </label>
                                <div className="flex flex-wrap items-center gap-3">
                                  {supportsDefaultOption ? (
                                    <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                                      <input type="checkbox" name="is_default" />
                                      Opción estándar
                                    </label>
                                  ) : (
                                    <input type="hidden" name="is_default" value="false" />
                                  )}
                                  <button type="submit" className="ui-btn ui-btn--brand" disabled={pendingKey === addOptionKey}>
                                    {pendingKey === addOptionKey ? "Agregando..." : "Agregar"}
                                  </button>
                                </div>
                              </div>

                              {groupKind === "extras" || groupKind === "replacements" || groupKind === "choice" ? (
                                <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                  <div className="mb-3">
                                    <div className="text-sm font-black text-[var(--ui-text)]">{groupKind === "replacements" ? "Inventario del producto que entra" : "Inventario que descuenta esta opción"}</div>
                                    <p className="ui-caption">{groupKind === "choice" ? "Opcional para tamaños o presentaciones. Úsalo si esta opción debe descontar un insumo específico, como vaso o cono." : "Obligatorio para adiciones y cambios. Se crea la regla de consumo al mismo tiempo que la opción."}</p>
                                  </div>
                                  <div className="grid gap-3 lg:grid-cols-[1fr_120px_150px]">
                                    <label className="space-y-2">
                                      <span className="ui-label">Producto operacional</span>
                                      <select name="option_product_id" className="ui-input">
                                        <option value="">Selecciona insumo</option>
                                        {snapshot.consumptionProducts.map((product) => (
                                          <option key={product.id} value={product.id}>{(product.name ?? "Sin nombre") + (product.sku ? ` · ${product.sku}` : "")}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="space-y-2">
                                      <span className="ui-label">Cantidad</span>
                                      <input name="option_quantity_per_option" type="number" min="0.0001" step="0.0001" className="ui-input" defaultValue="1" />
                                    </label>
                                    <label className="space-y-2">
                                      <span className="ui-label">Unidad</span>
                                      <select name="option_stock_unit_code" className="ui-input" defaultValue="">
                                        <option value="">Auto / stock</option>
                                        {snapshot.inventoryUnits.map((unit) => (
                                          <option key={unit.code} value={unit.code}>{unit.name}{unit.symbol ? ` (${unit.symbol})` : ""}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                </div>
                              ) : null}

                              {groupKind === "replacements" ? (
                                <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                                  <div className="mb-3">
                                    <div className="text-sm font-black text-[var(--ui-text)]">Ingrediente original que deja de descontarse</div>
                                    <p className="ui-caption">El cambio consume el producto nuevo y marca este ingrediente de la receta base como reemplazado.</p>
                                  </div>
                                  {snapshot.recipeIngredients.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm font-semibold text-[var(--ui-muted)]">Este producto base no tiene receta activa. Configura receta antes de crear cambios/reemplazos.</div>
                                  ) : (
                                    <label className="space-y-2">
                                      <span className="ui-label">Reemplaza a</span>
                                      <select name="replacement_target_ingredient_product_id" className="ui-input" required>
                                        <option value="">Selecciona ingrediente de receta</option>
                                        {snapshot.recipeIngredients.map((ingredient) => {
                                          const product = ingredient.product;
                                          if (!product) return null;
                                          return (
                                            <option key={ingredient.id} value={ingredient.ingredient_product_id}>{product.name ?? "Ingrediente"} · {formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}</option>
                                          );
                                        })}
                                      </select>
                                    </label>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </form>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div id="personalizacion-compartida" className="ui-panel space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Personalización compartida</div>
            <p className="ui-caption">
              Usa una plantilla para que varias variantes compartan los mismos grupos sin duplicar opciones ni reglas de inventario.
            </p>
          </div>
          {currentDisplayGroup ? (
            <span className="ui-chip ui-chip--brand">{currentDisplayGroup}</span>
          ) : (
            <span className="ui-chip">Sin agrupación visual</span>
          )}
        </div>

        {!currentDisplayGroup ? (
          <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm font-semibold text-[var(--ui-muted)]">
            Define una agrupación visual en el producto para administrar variantes compartidas desde aquí.
          </div>
        ) : null}

        {currentDisplayGroup && visibleOptionGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm font-semibold text-[var(--ui-muted)]">
            Crea primero una personalización. Después aparecerá aquí para compartirla con las variantes.
          </div>
        ) : null}

        {currentDisplayGroup && visibleOptionGroups.length > 0 ? (
          <div className="rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="ui-label">Nombre de la plantilla</span>
                <input
                  className="ui-input"
                  value={newSharedTemplateDraft.name}
                  onChange={(event) => updateNewSharedTemplateDraft({ name: event.target.value })}
                  placeholder={`${currentDisplayGroup} base`}
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="ui-label">Descripción</span>
                <input
                  className="ui-input"
                  value={newSharedTemplateDraft.description}
                  onChange={(event) => updateNewSharedTemplateDraft({ description: event.target.value })}
                  placeholder="Presentación y toppings compartidos"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                <div className="ui-label">Grupos que comparte</div>
                <div className="mt-3 space-y-2">
                  {visibleOptionGroups.map((group) => (
                    <label key={group.id} className="flex items-start gap-2 text-sm font-semibold text-[var(--ui-text)]">
                      <input
                        type="checkbox"
                        checked={newSharedTemplateDraft.groupIds.includes(group.id)}
                        onChange={() => updateNewSharedTemplateDraft({
                          groupIds: toggleStringValue(newSharedTemplateDraft.groupIds, group.id),
                        })}
                      />
                      <span>
                        {getSimpleGroupDisplayName(group)}
                        <span className="ui-caption block">{getSimpleGroupLabel(getSimpleGroupKind(group))}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                <div className="ui-label">Variantes que la usan</div>
                <div className="mt-3 space-y-2">
                  {visualVariants.length === 0 ? (
                    <div className="text-sm font-semibold text-[var(--ui-muted)]">No hay variantes activas para esta agrupación.</div>
                  ) : null}
                  {visualVariants.map((variant) => (
                    <label key={variant.id} className="flex items-start gap-2 text-sm font-semibold text-[var(--ui-text)]">
                      <input
                        type="checkbox"
                        checked={newSharedTemplateDraft.variantIds.includes(variant.id)}
                        onChange={() => updateNewSharedTemplateDraft({
                          variantIds: toggleStringValue(newSharedTemplateDraft.variantIds, variant.id),
                        })}
                      />
                      <span>
                        {getVariantLabel(variant)}
                        <span className="ui-caption block">{variant.id === itemId ? "Producto actual" : variant.name}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="ui-btn ui-btn--brand"
                disabled={
                  pendingKey === "create-shared-template" ||
                  !newSharedTemplateDraft.name.trim() ||
                  newSharedTemplateDraft.groupIds.length === 0
                }
                onClick={handleCreateSharedTemplate}
              >
                {pendingKey === "create-shared-template" ? "Guardando..." : "Guardar plantilla compartida"}
              </button>
            </div>
          </div>
        ) : null}

        {sharedTemplates.length > 0 ? (
          <div className="space-y-4">
            {sharedTemplates.map((template) => {
              const draft = sharedTemplateDrafts[template.id] ?? {
                name: template.name,
                description: template.description ?? "",
                groupIds: [],
                variantIds: [],
                isActive: template.is_active,
              };

              return (
                <div key={template.id} className="rounded-3xl border border-[var(--ui-border)] bg-white p-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="space-y-2">
                      <span className="ui-label">Plantilla</span>
                      <input
                        className="ui-input"
                        value={draft.name}
                        onChange={(event) => updateSharedTemplateDraft(template.id, { name: event.target.value })}
                        required
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="ui-label">Descripción</span>
                      <input
                        className="ui-input"
                        value={draft.description}
                        onChange={(event) => updateSharedTemplateDraft(template.id, { description: event.target.value })}
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                      <div className="ui-label">Grupos compartidos</div>
                      <div className="mt-3 space-y-2">
                        {visibleOptionGroups.map((group) => (
                          <label key={group.id} className="flex items-start gap-2 text-sm font-semibold text-[var(--ui-text)]">
                            <input
                              type="checkbox"
                              checked={draft.groupIds.includes(group.id)}
                              onChange={() => updateSharedTemplateDraft(template.id, {
                                groupIds: toggleStringValue(draft.groupIds, group.id),
                              })}
                            />
                            <span>
                              {getSimpleGroupDisplayName(group)}
                              <span className="ui-caption block">{getSimpleGroupLabel(getSimpleGroupKind(group))}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                      <div className="ui-label">Aplicar a variantes</div>
                      <div className="mt-3 space-y-2">
                        {visualVariants.map((variant) => (
                          <label key={variant.id} className="flex items-start gap-2 text-sm font-semibold text-[var(--ui-text)]">
                            <input
                              type="checkbox"
                              checked={draft.variantIds.includes(variant.id)}
                              onChange={() => updateSharedTemplateDraft(template.id, {
                                variantIds: toggleStringValue(draft.variantIds, variant.id),
                              })}
                            />
                            <span>
                              {getVariantLabel(variant)}
                              <span className="ui-caption block">{variant.id === itemId ? "Producto actual" : variant.name}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(event) => updateSharedTemplateDraft(template.id, { isActive: event.target.checked })}
                      />
                      Plantilla activa
                    </label>

                    <button
                      type="button"
                      className="ui-btn ui-btn--brand"
                      disabled={
                        pendingKey === `update-shared-template:${template.id}` ||
                        !draft.name.trim() ||
                        draft.groupIds.length === 0
                      }
                      onClick={() => handleUpdateSharedTemplate(template)}
                    >
                      {pendingKey === `update-shared-template:${template.id}` ? "Guardando..." : "Guardar plantilla"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {snapshot.recipeIngredients.length > 0 && !hasVisibleRemovalsGroup ? (
        <div id="receta-inventario" className="ui-panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-h3">3. Receta / Inventario</div>
              <p className="ui-caption">Atajos para convertir ingredientes de receta en opciones “Sin X”.</p>
            </div>
            <span className="ui-chip">{snapshot.recipeIngredients.length} ingrediente{snapshot.recipeIngredients.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.recipeIngredients.map((ingredient) => {
              const product = ingredient.product;
              if (!product) return null;
              return (
                <button
                  key={ingredient.id}
                  type="button"
                  disabled={pendingKey === `create-removal:${ingredient.id}`}
                  onClick={() => void mutate("create_removal_option_from_recipe", { ingredientProductId: ingredient.ingredient_product_id, ingredientName: product.name ?? "Ingrediente", stockUnitCode: product.stock_unit_code || product.unit || "" }, `Opción Sin ${product.name ?? "Ingrediente"} creada.`, { pendingKey: `create-removal:${ingredient.id}` })}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[var(--ui-text)]">Sin {product.name ?? "Ingrediente"}</span>
                    <span className="ui-caption">{formatQuantityAdmin(ingredient.quantity)} {product.stock_unit_code || product.unit || "unidad"}</span>
                  </span>
                  <span className="ui-btn ui-btn--ghost shrink-0">Crear</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
