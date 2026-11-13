/** Product assortment adapted from the supplied Woodora mockup. All commercial data is demo data. */
type SeedVariant = {
  sku: string;
  label: string;
  price: number;
  shippingClass: "kasur" | "bantal" | "furnitur";
  attributes: Record<string, string | number>;
  stock: number;
  images?: Array<{ url: string; alt: string }>;
};
export type SeedProduct = {
  slug: string;
  name: string;
  category: "kasur" | "bantal" | "furnitur";
  summary: string;
  description: string;
  care: string;
  images: Array<{ url: string; alt: string }>;
  status: "draft" | "published" | "archived";
  variants: SeedVariant[];
};

const image = (slug: string, alt: string) => ({
  url: `/images/collection/${slug}.jpg`,
  alt,
});
type Piece = {
  slug: string;
  name: string;
  summary: string;
  material: string;
  finish: string;
  dimensions: [number, number, number];
  price: number;
  stock?: number;
  category?: "bantal";
};
const pieces: Piece[] = [
  {
    slug: "cozynest-sofa",
    name: "The Cozynest Sofa",
    summary:
      "Sofa dengan siluet lembut dan dudukan lapang untuk menikmati waktu bersama.",
    material: "Kain bouclé dan rangka kayu",
    finish: "Ivory",
    dimensions: [220, 95, 78],
    price: 12990000,
  },
  {
    slug: "veroliving-coffee-table",
    name: "Veroliving Coffee Table",
    summary:
      "Meja kopi bundar dengan kaki walnut skulptural. Titik temu di ruang keluarga.",
    material: "Kayu walnut",
    finish: "Walnut alami",
    dimensions: [92, 92, 38],
    price: 5490000,
  },
  {
    slug: "elmora-modern-desk",
    name: "Elmora Modern Desk",
    summary:
      "Meja kerja ramping dengan ruang penyimpanan untuk sudut kerja yang tertata.",
    material: "Kayu oak",
    finish: "Oak alami",
    dimensions: [120, 60, 75],
    price: 8490000,
  },
  {
    slug: "serenity-lounge-chair",
    name: "Serenity Lounge Chair & Ottoman",
    summary:
      "Kursi santai dengan ottoman, kulit karamel, dan rangka walnut untuk jeda yang tenang.",
    material: "Kayu walnut dan kulit",
    finish: "Walnut & karamel",
    dimensions: [88, 85, 94],
    price: 7290000,
  },
  {
    slug: "rustic-side-table",
    name: "Rustic Side Table",
    summary:
      "Meja samping kayu dengan tekstur alami, pas untuk buku dan secangkir kopi.",
    material: "Kayu oak",
    finish: "Oak alami",
    dimensions: [45, 45, 50],
    price: 2990000,
  },
  {
    slug: "cascade-bookshelf",
    name: "Cascade Bookshelf",
    summary:
      "Rak buku terbuka dengan susunan bertingkat untuk koleksi dan benda kesayangan.",
    material: "Kayu oak",
    finish: "Oak alami",
    dimensions: [90, 35, 180],
    price: 7990000,
    stock: 4,
  },
  {
    slug: "aurora-bed-frame",
    name: "Aurora Bed Frame",
    summary:
      "Rangka tempat tidur kayu bergaris bersih untuk kamar yang terasa ringan. Kasur dijual terpisah.",
    material: "Kayu walnut",
    finish: "Walnut alami",
    dimensions: [168, 210, 90],
    price: 17990000,
  },
  {
    slug: "maplecraft-dining-chairs",
    name: "Maplecraft Dining Chairs",
    summary:
      "Kursi makan dengan sandaran melengkung dan dudukan nyaman. Harga per kursi.",
    material: "Kayu maple dan kain",
    finish: "Maple alami",
    dimensions: [48, 52, 80],
    price: 2490000,
  },
  {
    slug: "coastal-patio-set",
    name: "Coastal Patio Set",
    summary:
      "Set kursi dan meja teras untuk menikmati suasana luar ruang yang teduh.",
    material: "Rotan sintetis dan rangka aluminium",
    finish: "Sand",
    dimensions: [140, 75, 78],
    price: 15990000,
  },
  {
    slug: "klint-floor-monolith",
    name: "Klint Floor Monolith",
    summary:
      "Lampu lantai dengan diffuser linen dan detail walnut untuk sudut baca.",
    material: "Kayu walnut dan linen",
    finish: "Natural",
    dimensions: [42, 42, 155],
    price: 3290000,
  },
  {
    slug: "fjord-woven-area-rug",
    name: "Fjord Woven Area Rug",
    summary:
      "Karpet tenun 200 × 300 cm bernuansa pasir untuk melengkapi ruang keluarga.",
    material: "Serat tenun",
    finish: "Undyed sand",
    dimensions: [200, 300, 1],
    price: 5790000,
  },
  {
    slug: "atelier-wood-care-kit",
    name: "Atelier Wood Care Kit",
    summary:
      "Perlengkapan perawatan kayu berisi wax dan sikat untuk menjaga furnitur.",
    material: "Beeswax dan sikat",
    finish: "Natural",
    dimensions: [22, 16, 10],
    price: 690000,
  },
  {
    slug: "beeswax-care-kit",
    name: "Beeswax Care Kit",
    summary:
      "Poles perawatan kayu untuk membantu menjaga permukaan meja dan kursi.",
    material: "Beeswax",
    finish: "Natural",
    dimensions: [10, 10, 8],
    price: 390000,
  },
  {
    slug: "linen-cushion-set",
    name: "Linen Cushion Set",
    summary: "Set bantal dekoratif berbahan linen untuk sofa dan kursi santai.",
    material: "Linen",
    finish: "Sand",
    dimensions: [45, 45, 14],
    price: 890000,
    category: "bantal",
  },
];

export const collectionProducts: SeedProduct[] = pieces.map((piece, index) => ({
  slug: piece.slug,
  name: piece.name,
  category: piece.category ?? "furnitur",
  summary: piece.summary,
  description: `${piece.summary} Material: ${piece.material}. Ukuran ${piece.dimensions.join(" × ")} cm. Spesifikasi dan harga merupakan contoh untuk demonstrasi katalog Ruang Teduh.`,
  care:
    piece.category === "bantal"
      ? "Bersihkan noda dengan kain lembap. Keringkan di tempat teduh."
      : "Bersihkan dengan kain lembut. Hindari kelembapan berlebih dan sinar matahari langsung. Uji produk perawatan pada area kecil terlebih dahulu.",
  images:
    piece.slug === "serenity-lounge-chair"
      ? [
          image(
            "serenity-detail-0",
            "Serenity Lounge Chair dan ottoman kulit karamel di ruang keluarga",
          ),
          ...[1, 2, 3, 4].map((n) =>
            image(`serenity-detail-${n}`, `Detail ${n} Serenity Lounge Chair`),
          ),
        ]
      : [image(piece.slug, piece.name)],
  status: "published",
  variants: [
    {
      sku: `RT-${piece.slug.toUpperCase()}-01`,
      label: piece.finish,
      price: piece.price,
      shippingClass: piece.category ?? "furnitur",
      attributes: {
        material: piece.material,
        finish: piece.finish,
        widthCm: piece.dimensions[0],
        depthCm: piece.dimensions[1],
        heightCm: piece.dimensions[2],
        ...(piece.category
          ? { size: "45 × 45 cm", fill: "Serat poliester" }
          : {}),
      },
      stock: piece.stock ?? 8 + index,
    },
    ...(piece.slug === "serenity-lounge-chair"
      ? [
          {
            sku: "RT-SERENITY-OAK-02",
            label: "White oak & karamel",
            price: 7790000,
            shippingClass: "furnitur" as const,
            attributes: {
              material: "Kayu oak dan kulit",
              finish: "White oak & karamel",
              widthCm: 88,
              depthCm: 85,
              heightCm: 94,
            },
            stock: 3,
          },
        ]
      : []),
  ],
}));

// Exact legacy demo slugs only. User-created products are never archived by the catalog upgrade.
export const legacyDemoSlugs = [
  "kasur-serat-kelapa",
  "kasur-busa-kepadatan-tinggi",
  "kasur-pegas-bersaku",
  "bantal-serat-poliester",
  "bantal-lateks",
  "sofa-dua-dudukan-linen",
  "kursi-kayu-jati",
  "meja-samping-kayu",
  "rak-buku-rendah",
];
