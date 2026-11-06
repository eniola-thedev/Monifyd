export type BlogSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type BlogArticle = {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  excerpt: string;
  category: string;
  imageAlt: string;
  featureImage: {
    src: string;
    alt: string;
    caption: string;
    credit: string;
    license: string;
    licenseUrl: string;
    source: string;
  };
  sections: BlogSection[];
  relatedLinks: { label: string; href: string }[];
};

export const blogArticles: BlogArticle[] = [
  {
    slug: "what-is-monifyd",
    title: "What Is Monifyd?",
    seoTitle: "What Is Monifyd? Crypto Payments Explained | Monifyd",
    description: "Learn how Monifyd helps businesses request and track non-custodial crypto payments with payment links, invoices, checkout and an API.",
    excerpt: "A practical introduction to requesting crypto payments, following their status and receiving funds directly in a merchant-controlled wallet.",
    category: "Getting started",
    imageAlt: "Monifyd editorial graphic showing the crypto payment checkout and confirmation flow.",
    featureImage: {
      src: "/blog/bitcoin-atm-in-city-galleria-zadar.jpg",
      alt: "A Bitcoin ATM in City Galleria, Zadar, with a large orange Bitcoin symbol behind it.",
      caption: "A public Bitcoin ATM in Zadar, Croatia—not a Monifyd checkout terminal.",
      credit: "\"Bitcoin ATM in City Galleria, Zadar\" by Mnalis",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      source: "https://commons.wikimedia.org/wiki/File:Bitcoin_ATM_in_City_Galleria,_Zadar.jpg",
    },
    sections: [
      {
        heading: "The challenge of accepting crypto",
        paragraphs: [
          "A wallet address alone does not make a payment workflow. A business also has to tell a customer what to pay, make the asset and network clear, identify the incoming transfer and decide when the payment is confirmed.",
          "Doing each part by hand can make invoices harder to reconcile and leaves customers unsure whether a transfer arrived. Monifyd brings the request, hosted checkout and payment status into one workflow.",
        ],
      },
      {
        heading: "What Monifyd does",
        paragraphs: [
          "Monifyd is a non-custodial crypto payment platform for businesses and developers. Merchants create payment links or invoices, share a checkout page, and use the dashboard or API to follow the payment lifecycle.",
          "Checkout shows the customer the amount, supported coin, network and merchant receiving address. Monifyd monitors configured networks for transfers and updates the payment as it is detected and confirmed. Confirmation time depends on the network and its configured confirmation depth.",
        ],
      },
      {
        heading: "How a payment works",
        bullets: [
          "A merchant adds a receiving wallet and chooses the assets and networks to accept.",
          "The merchant creates a payment link or invoice with the amount and relevant customer details.",
          "The customer opens the hosted checkout and sends the requested asset on the selected network.",
          "Monifyd tracks the transfer and reports its status as it moves through detection and confirmation.",
        ],
      },
      {
        heading: "Who can use it",
        paragraphs: [
          "Freelancers can send a payment request for a project. Online businesses can share a link from a store, message or email. Teams can manage invoices and payment history in a dashboard, while developers can create requests and receive status events through the API and signed webhooks.",
          "The supported coins and networks depend on the merchant's configuration. Review the current [supported networks](/supported-networks) before asking a customer to pay.",
        ],
      },
      {
        heading: "Links, invoices and integrations",
        paragraphs: [
          "A payment link is useful when a merchant needs a reusable way to request a specific payment. An invoice adds billing details such as a customer, line items and a due date. Both lead to a hosted checkout, so the customer can see where and how to pay.",
          "Developers can create links and invoices from their server, retrieve payment records, and handle status changes with webhooks. The [API documentation](/docs) describes available endpoints and webhook verification.",
        ],
      },
      {
        heading: "Non-custodial by design",
        paragraphs: [
          "Monifyd provides payment software; it does not hold merchant payment balances or ask for wallet seed phrases or private keys. Funds are sent to the receiving address configured by the merchant, who remains responsible for protecting wallet access and arranging any refunds.",
          "See [how non-custodial crypto payments work](/blog/non-custodial-crypto-payments) for the trade-offs and responsibilities involved.",
        ],
      },
      {
        heading: "Start with a payment request",
        paragraphs: [
          "Monifyd gives businesses a way to create a request, guide a customer through checkout and keep a record of payment status. Explore [pricing](/pricing), review the [supported networks](/supported-networks), or visit [Monifyd](/) to get started.",
        ],
      },
    ],
    relatedLinks: [
      { label: "Create a payment link", href: "/#features" },
      { label: "Explore pricing", href: "/pricing" },
      { label: "Read the developer docs", href: "/docs" },
    ],
  },
  {
    slug: "accept-crypto-payments",
    title: "How to Accept Crypto Payments",
    seoTitle: "How to Accept Crypto Payments | A Practical Guide | Monifyd",
    description: "A practical guide to accepting cryptocurrency payments: choose supported networks, set up a wallet, send payment requests and track confirmations.",
    excerpt: "From choosing a network to reconciling a confirmed payment, here is a clear workflow for accepting crypto from customers.",
    category: "For businesses",
    imageAlt: "Monifyd editorial graphic explaining the steps from a crypto payment request to confirmation.",
    featureImage: {
      src: "/blog/bitcoin-atm-in-bicocca-village.jpg",
      alt: "A Bitcoin ATM installed in Bicocca Village, Milan.",
      caption: "A Bitcoin ATM in Bicocca Village, Milan, photographed as an example of a public crypto payment service.",
      credit: "\"Bitcoin ATM in Bicocca Village\" by Airon90",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      source: "https://commons.wikimedia.org/wiki/File:Bitcoin_ATM_in_Bicocca_Village.jpg",
    },
    sections: [
      {
        heading: "Start with the payment workflow",
        paragraphs: [
          "Accepting cryptocurrency involves more than displaying an address. Your customer needs an exact request and clear instructions, and your business needs a reliable way to match an incoming transfer to the right sale.",
          "A hosted checkout can guide the customer through the request while a payment platform watches for the transfer. Before choosing a setup, decide which assets your business needs and which networks your customers can use.",
        ],
      },
      {
        heading: "Choose an asset and network",
        paragraphs: [
          "A coin can exist on more than one network, and sending an asset on the wrong network can make funds difficult or impossible to recover. Tell customers exactly which coin and network to use, and verify that both sides support the same combination.",
          "Monifyd supports selected combinations including BTC on Bitcoin; ETH and stablecoins on Ethereum; SOL and stablecoins on Solana; and other configured EVM networks. The full list can change, so check [supported networks](/supported-networks) before publishing payment instructions.",
        ],
      },
      {
        heading: "Set up your receiving wallet",
        paragraphs: [
          "Add a wallet address you control for each network you plan to accept. Double-check the address and network, and use a wallet setup that your business can protect and recover. Never share a seed phrase or private key with a payment provider.",
          "A non-custodial setup sends customer funds to the merchant's configured address. That keeps wallet access with the merchant, who is also responsible for wallet security and any refunds.",
        ],
      },
      {
        heading: "Create a payment request",
        paragraphs: [
          "Create a payment link for a simple request or an invoice when you need customer and billing details. Include an accurate description and amount, choose the accepted payment options, then send the customer the checkout link.",
          "Monifyd checkout displays the payment instructions for the chosen asset and network. The customer should use the amount and receiving address shown there—not an address copied from an unrelated request.",
        ],
      },
      {
        heading: "Track detection and confirmation",
        paragraphs: [
          "A transaction appearing in a wallet does not always mean an order should be treated as settled immediately. The payment may first be detected and then wait for the required blockchain confirmations. Network activity and the confirmation policy affect how long this takes.",
          "Keep your order pending until your payment system reports a confirmed status. With Monifyd, merchants can follow payment status in the dashboard or use signed webhooks to update an order in their own application. See the [API and webhook guide](/docs) for integration details.",
        ],
      },
      {
        heading: "Plan for exceptions",
        paragraphs: [
          "Customers can send the wrong amount, use an unsupported network or pay after a quote expires. Decide how your team will reconcile these cases before launch. A payment platform can surface payment status and unmatched transfers, but it cannot reverse a blockchain transaction.",
          "Refunds are sent manually by the merchant from its own wallet. Check the transaction details and refund destination carefully before sending funds.",
        ],
      },
      {
        heading: "A launch checklist",
        bullets: [
          "Test every asset and network combination with a small transfer.",
          "Confirm that the checkout address matches your wallet on that network.",
          "Wait for the payment to reach its confirmed status before fulfilling an order.",
          "Tell customers which networks are accepted and where to get help.",
          "Review your reconciliation, unmatched-payment and refund procedures.",
        ],
      },
      {
        heading: "Make the process repeatable",
        paragraphs: [
          "Payment links and invoices make requests easier to share; payment tracking helps your team reconcile what arrived. Explore [Monifyd payment tools](/#features), compare [plans](/pricing), or [create an account](/signup) to set up your workflow.",
        ],
      },
    ],
    relatedLinks: [
      { label: "See supported networks", href: "/supported-networks" },
      { label: "Compare plans", href: "/pricing" },
      { label: "Build an integration", href: "/developers" },
    ],
  },
  {
    slug: "non-custodial-crypto-payments",
    title: "Non-Custodial Crypto Payments",
    seoTitle: "Non-Custodial Crypto Payments: How They Work | Monifyd",
    description: "Understand non-custodial crypto payments, how merchant funds reach a wallet, and the security and operational responsibilities that remain.",
    excerpt: "Learn what non-custodial means in a payment workflow, what it changes for businesses and what responsibilities stay with the wallet owner.",
    category: "Payment infrastructure",
    imageAlt: "Monifyd editorial graphic showing a customer payment moving directly to a merchant-controlled wallet.",
    featureImage: {
      src: "/blog/bitcoin-on-laptop-keyboard.jpg",
      alt: "A physical Bitcoin token resting on a computer keyboard.",
      caption: "A physical Bitcoin token on a keyboard; it is illustrative and not a Monifyd wallet or product.",
      credit: "\"Bitcoin on Laptop Keyboard\" by Satheesh Sankaran",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      source: "https://commons.wikimedia.org/wiki/File:Bitcoin_on_Laptop_Keyboard.jpg",
    },
    sections: [
      {
        heading: "What non-custodial means",
        paragraphs: [
          "In a non-custodial payment setup, the merchant controls the wallet that receives funds. A payment service can provide checkout, monitor supported blockchains and report payment status without taking control of the merchant's private keys or holding a customer balance on the merchant's behalf.",
          "This differs from a custodial arrangement, where a provider controls the keys or holds funds in an account that the customer or merchant later withdraws from. The exact responsibilities depend on the provider and product, so read the terms of any service you use.",
        ],
      },
      {
        heading: "How the payment moves",
        paragraphs: [
          "A merchant configures a receiving address for an asset and network. Checkout presents the customer with the payment instructions, and the customer sends the transfer from their own wallet. The blockchain records the transfer to the merchant's receiving address.",
          "A monitoring service can associate an incoming transfer with a payment request and track confirmations. Monitoring does not give the service the ability to move the funds; the merchant uses its own wallet to manage them.",
        ],
      },
      {
        heading: "What Monifyd handles",
        paragraphs: [
          "Monifyd provides payment links, invoices, hosted checkout, payment status tracking and developer tools. It watches configured networks for transfers and reports status changes after the relevant confirmation rules are met.",
          "Monifyd does not ask merchants for seed phrases or private keys and does not hold merchant payment balances. The merchant remains in control of its wallet. Learn more about the [payment workflow](/blog/what-is-monifyd) and the [networks available](/supported-networks).",
        ],
      },
      {
        heading: "Benefits and trade-offs",
        bullets: [
          "Wallet control stays with the merchant rather than depending on a provider-held balance.",
          "The merchant is responsible for secure key storage, wallet access and recovery.",
          "On-chain transfers are generally irreversible; errors in the address, asset or network can be costly.",
          "Confirmation times vary, and monitoring depends on blockchain data and network-provider availability.",
          "Refunds must be sent by the merchant from its wallet; tracking a payment does not automatically return funds.",
        ],
      },
      {
        heading: "Good practices for merchants",
        paragraphs: [
          "Use a wallet and key-management process appropriate to your business, limit who can authorize transfers, and test the full payment flow before accepting customer funds. Check the receiving address and selected network on every request.",
          "In your application, treat a transaction as paid only when your trusted payment system reports the confirmed status. If you connect through webhooks, verify each signature and handle duplicate deliveries safely. Monifyd's [developer documentation](/docs) explains webhook verification.",
        ],
      },
      {
        heading: "Keep control and keep a record",
        paragraphs: [
          "Non-custodial payments put wallet control in the merchant's hands while a payment platform can reduce the manual work of requesting and tracking transfers. That arrangement is not risk-free: wallet security and transaction decisions remain the merchant's responsibility.",
          "Review [Monifyd pricing](/pricing), learn about [payment links and invoices](/#features), or visit [Monifyd](/) to see how the product fits your payment process.",
        ],
      },
    ],
    relatedLinks: [
      { label: "Learn about Monifyd", href: "/blog/what-is-monifyd" },
      { label: "Review supported networks", href: "/supported-networks" },
      { label: "Read about pricing", href: "/pricing" },
    ],
  },
];

export function getBlogArticle(slug: string): BlogArticle | undefined {
  return blogArticles.find((article) => article.slug === slug);
}

export function headingId(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
