import { useState } from "react";
import mockOcrData from "../../../../mock-data/mockOcrData.json";

function ExtractedDataPanel() {
  const { products } = mockOcrData;

  // state management for products -> sub-models -> parts
  const [openProducts, setOpenProducts] = useState<string[]>([]);
  const [openSubModels, setOpenSubModels] = useState<string[]>([]);
  const [openParts, setOpenParts] = useState<string[]>([]);

  {
    /* Functions /*/
  }

  // Table Header (fetched dynamically)
  const productHeaders =
    products.length > 0
      ? Object.keys(products[0]).filter((key) => key !== "components")
      : [];

  // Currency formatting function
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
    }).format(amount);
  };

  // Collapse function for Product
  const toggleProduct = (modelCode: string) => {
    if (openProducts.includes(modelCode)) {
      setOpenProducts(openProducts.filter((item) => item !== modelCode));
    } else {
      setOpenProducts([...openProducts, modelCode]);
    }
  };

  // Collapse function for Sub-Model
  const toggleSubModel = (code: string) => {
    if (openSubModels.includes(code)) {
      setOpenSubModels(openSubModels.filter((item) => item !== code));
    } else {
      setOpenSubModels([...openSubModels, code]);
    }
  };

  // Collapse function for Parts
  const togglePart = (code: string) => {
    if (openParts.includes(code)) {
      setOpenParts(openParts.filter((item) => item !== code));
    } else {
      setOpenParts([...openParts, code]);
    }
  };

  return (
    <div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-base-content">
        EXTRACTED DATA
      </h2>

      {/* Table */}
      <div className="overflow-auto max-h-[500px]">
        <table className="table w-full border border-base-600">
          {/* Table Header */}
          <thead>
            <tr className="text-base-content/70">
              {productHeaders.map((key) => (
                <th key={key} className="p-3 text-left">
                  {key
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {products.map((product) => (
              <>
                {/* Product Row */}
                <tr
                  key={product.model_code}
                  onClick={() => toggleProduct(product.model_code)}
                  className="border-b border-base-300 cursor-pointer hover:bg-base-300/40"
                >
                  {productHeaders.map((key) => {
                    let value = (product as any)[key];

                    if (key.includes("price") && typeof value === "number") {
                      value = formatCurrency(value);
                    }

                    return (
                      <td key={key} className="p-3 text-base-content">
                        {key === "item_number" && (
                          <span className="mr-2">
                            {openProducts.includes(product.model_code)
                              ? "▼"
                              : "▶"}
                          </span>
                        )}
                        {value}
                      </td>
                    );
                  })}
                </tr>

                {/* Collapsable rows */}

                {openProducts.includes(product.model_code) &&
                  product.components?.map((component: any, index: number) => {
                    // CASE 1 (submodel has parts Item -> SubModel -> Parts)
                    if (component.parts) {
                      return (
                        <>
                          {/* SubModel Row (Item -> SubModel) */}
                          <tr
                            key={component.sub_model || index}
                            onClick={() => toggleSubModel(component.sub_model)}
                            className="bg-base-300/20 cursor-pointer"
                          >
                            {/* SUBMODEL ICON */}
                            <td className="p-3 pl-8">
                              <span className="mr-2">
                                {openSubModels.includes(component.sub_model)
                                  ? "▼"
                                  : "▶"}
                              </span>
                              {component.sub_model}
                            </td>

                            <td className="p-3"></td>

                            <td className="p-3 text-right">
                              {component.sub_total_price
                                ? formatCurrency(component.sub_total_price)
                                : "-"}
                            </td>
                          </tr>

                          {/* Parts inside the submodel (Item -> SubModel -> Parts) */}
                          {openSubModels.includes(component.sub_model) &&
                            component.parts.map((part: any) => (
                              <>
                                <tr
                                  key={part.code}
                                  onClick={(e) => {
                                    e.stopPropagation(); // Prevent triggering submodel collapse
                                    if (part.details) {
                                      togglePart(part.code);
                                    }
                                  }}
                                  className={`bg-base-300/10 border-b border-base-300 ${
                                    part.details
                                      ? "cursor-pointer hover:bg-base-300/30"
                                      : ""
                                  }`}
                                >
                                  {/* PART ICON */}
                                  <td className="p-3 pl-16">
                                    {part.details && (
                                      <span className="mr-2">
                                        {openParts.includes(part.code)
                                          ? "▼"
                                          : "▶"}
                                      </span>
                                    )}
                                    {part.code}
                                  </td>

                                  <td className="p-3"></td>

                                  <td className="p-3 text-right">
                                    {formatCurrency(part.price)}
                                  </td>
                                </tr>

                                {/* PART DETAILS */}

                                {openParts.includes(part.code) &&
                                  part.details?.map((detail: any) => (
                                    <tr
                                      key={detail.code}
                                      className="bg-base-300/5 border-b border-base-300"
                                    >
                                      <td className="p-3 pl-24">
                                        {detail.code}
                                      </td>

                                      <td className="p-3"></td>

                                      <td className="p-3 text-right">
                                        {formatCurrency(detail.price)}
                                      </td>
                                    </tr>
                                  ))}
                              </>
                            ))}
                        </>
                      );
                    }

                    // CASE 2 (submodel has no parts, Item -> SubModel OR Item -> Part -> Detail)
                    return (
                      <>
                        <tr
                          key={component.code || index}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (component.details) {
                              togglePart(component.code);
                            }
                          }}
                          className={`bg-base-300/20 ${component.details ? "cursor-pointer hover:bg-base-300/30" : ""}`}
                        >
                          {/* SUBMODEL ICON */}
                          <td className="p-3 pl-8">
                            {component.details && (
                              <span className="mr-2">
                                {openParts.includes(component.code) ? "▼" : "▶"}
                              </span>
                            )}
                            {component.code || component.sub_model}
                          </td>

                          <td className="p-3"></td>

                          <td className="p-3 text-right">
                            {component.price !== undefined
                              ? formatCurrency(component.price)
                              : component.sub_total_price
                                ? formatCurrency(component.sub_total_price)
                                : "-"}
                          </td>
                        </tr>

                        {/* PART DETAILS */}
                        {openParts.includes(component.code) &&
                          component.details?.map((detail: any) => (
                            <tr
                              key={detail.code}
                              className="bg-base-300/5 border-b border-base-300"
                            >
                              <td className="p-3 pl-16">{detail.code}</td>

                              <td className="p-3"></td>

                              <td className="p-3 text-right">
                                {formatCurrency(detail.price)}
                              </td>
                            </tr>
                          ))}
                      </>
                    );
                  })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ExtractedDataPanel;
