/**
 * Terra site content, sourced from the Terra fundraising deck.
 * Centralised so copy stays consistent across sections.
 */

export const nav = [
  { label: "The Eyes", href: "#camera" },
  { label: "About Us", href: "#about" },
  { label: "Inquire", href: "#inquire" },
] as const;

export const founders = [
  {
    name: "Jaiyen Shetty",
    role: "Co-founder & CEO",
    school: "UC Berkeley",
    prev: "Prev. Product @ Meta · AI Research @ Gates",
    email: "jaiyen_shetty@berkeley.edu",
    linkedin: "https://www.linkedin.com/in/jaiyen/",
    phone: "559-917-3739",
    blurb:
      "Leads Terra's learning engine, five months on the ground across Africa keeping the vision model sharp year-round.",
  },
  {
    name: "Kamran Salahuddin",
    role: "Co-founder & CTO",
    school: "University of Chicago",
    prev: "Prev. Founding Team @ Dolphin Labs",
    email: "kamransalahuddin@uchicago.edu",
    linkedin: "https://www.linkedin.com/in/kamransala/",
    phone: "559-906-5508",
    blurb:
      "Leads Terra's commercial engine across the U.S., where Terra sells, deploys, and earns.",
  },
] as const;

export const tractionStats = [
  { value: "185,000", label: "Acres under signed LOI" },
  { value: "~10%", label: "Of Fresno County farmland" },
  { value: "9", label: "Growers signed" },
  { value: "$0", label: "Customer acquisition cost" },
] as const;

export const signedFarms = ["Batth Farms", "Creekside Farms", "Hilltop Ranch Farms"] as const;

export const brain = {
  title: "The Brain",
  tagline: "AI agents that run the whole operation.",
  body: "Agents that connect the farm's fragmented data, bills, logs, telemetry, labor, finance, into a single operational layer, then act on it within your control.",
  points: [
    "Reads every signal: field, labor, finance",
    "Decides the next move",
    "Acts before the cost hits",
  ],
} as const;

export const eyes = {
  title: "The Eyes",
  tagline: "Computer vision that grounds the agents in reality.",
  body: "Cameras on the farm using computer vision to ground the agents in the physical field, capturing what's actually happening, acre by acre.",
  points: [
    "Captures ground truth: every acre, fruit, tree, row",
    "Sees what the field is actually doing",
    "Feeds the Brain so it decides on reality",
  ],
} as const;

export const caseStudy = {
  kicker: "Case Study 01 · PG&E Demand Charges",
  title: "Farmers already have the data. Terra turns it into decisions before they cost money.",
  steps: [
    {
      title: "Reads what you already have",
      body: "It pulls in the bills, logs, and spreadsheets a farm already produces.",
    },
    {
      title: "Finds the costly mistakes",
      body: "It catches expensive errors hiding in plain sight, like a single mistimed pump that triggers a full monthly demand charge.",
    },
    {
      title: "Acts before the bill hits",
      body: "It surfaces the move in time to avoid the cost, not after.",
    },
  ],
  mistimed: { value: "$3,000+", label: "Full monthly charge for minutes of use" },
  withTerra: { value: "~$200", label: "Pay for actual usage, not the penalty" },
  footnote:
    "One mistimed pump triggers a full month's charge. Terra flags the billing cycle so you avoid it.",
} as const;

export const problems = [
  {
    title: "Disconnected",
    body: "A farm's data lives in dozens of disconnected places. Bills, spreadsheets, separate tools that never talk. No one sees the full picture.",
  },
  {
    title: "Seen, never captured",
    body: "Every tractor pass sees the whole farm. Almost none of it gets captured. By the time a problem is obvious, the money is already gone.",
  },
] as const;

export const stakes = [
  {
    value: "40%",
    body: "of the world's crops are lost to pests and disease every year, more than $220B in revenue gone, straight off the grower's bottom line.",
  },
  {
    value: "$10B",
    body: "a year in environmental and health damage from pesticide use across the U.S., from contaminated groundwater to public-health costs.",
  },
] as const;
