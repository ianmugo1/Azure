import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ------------------------------------------------------------------
   Local persistence shim.
   The claude.ai artifact used window.storage; on your machine we back
   the same async get/set/delete with the browser's localStorage.
   Scores are saved per-browser under the key below. Clearing site data
   (or the in-app "Clear history" button) resets them.
   ------------------------------------------------------------------ */
const storage = {
  async get(key) {
    try { const v = localStorage.getItem(key); return v == null ? null : { value: v }; }
    catch { return null; }
  },
  async set(key, value) {
    try { localStorage.setItem(key, value); return { value }; }
    catch { return null; }
  },
  async delete(key) {
    try { localStorage.removeItem(key); return { deleted: true }; }
    catch { return null; }
  },
};

/* ==================================================================
   AZ-900 EXAM SIMULATOR
   Mirrors the Microsoft Azure Fundamentals (OnVUE/Pearson) experience:
   timed, no feedback until submit, flag/mark-for-review, review grid,
   auto-submit on timeout, 700/1000 pass mark, domain score report.
   Question types: single, multi, drag-drop match, yes/no series, dropdown.
   ================================================================== */

const DOMAINS = {
  concepts: { label: "Cloud concepts", weight: 0.30, short: "1" },
  architecture: { label: "Azure architecture & services", weight: 0.40, short: "2" },
  governance: { label: "Management & governance", weight: 0.30, short: "3" },
};
const PASS_MARK = 700;
const STORE_KEY = "az900:sim:history:v1";
const USER_KEY = "az900:sim:user:v1";
const REMOTE_TABLE = import.meta.env.VITE_SUPABASE_TABLE || "az900_history";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const canRemote = Boolean(SUPABASE_URL && SUPABASE_KEY);
const remoteHeaders = canRemote ? {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
} : null;

async function remoteGet(userId) {
  if (!canRemote || !userId) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(REMOTE_TABLE)}?select=history&user_id=eq.${encodeURIComponent(userId)}`;
    const resp = await fetch(url, { headers: remoteHeaders });
    if (!resp.ok) return null;
    const rows = await resp.json();
    return Array.isArray(rows) && rows.length ? rows[0].history || [] : [];
  } catch {
    return null;
  }
}

async function remoteSet(userId, history) {
  if (!canRemote || !userId) return false;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(REMOTE_TABLE)}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { ...remoteHeaders, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ user_id: userId, history }]),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function remoteDelete(userId) {
  if (!canRemote || !userId) return false;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(REMOTE_TABLE)}?user_id=eq.${encodeURIComponent(userId)}`;
    const resp = await fetch(url, {
      method: "DELETE",
      headers: remoteHeaders,
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  QUESTION BANK                                                     */
/* ------------------------------------------------------------------ */
const BANK = [
  /* ---------- CLOUD CONCEPTS ---------- */
  { id: "c1", domain: "concepts", type: "single",
    q: "In a consumption-based cloud model, how are charges typically calculated?",
    options: ["A fixed monthly fee regardless of usage", "Only for the resources that are actually consumed", "A one-time perpetual licence fee per server", "A charge for each user who can access the service"],
    correct: 1,
    ex: "In a consumption-based model, customers pay only for the resources they use, which shifts spending from capital expenditure to operating expenditure." },
  { id: "c2", domain: "concepts", type: "single",
    q: "Which term describes the ability to automatically add or remove resources to meet changing demand?",
    options: ["High availability", "Elasticity", "Disaster recovery", "Fault tolerance"],
    correct: 1,
    ex: "Elasticity refers to the ability to scale resources dynamically in response to changing demand." },
  { id: "c3", domain: "concepts", type: "single",
    q: "Purchasing physical servers for your own datacentre is an example of which spending type?",
    options: ["Operational expenditure (OpEx)", "Capital expenditure (CapEx)", "Consumption expenditure", "Elastic expenditure"],
    correct: 1,
    ex: "CapEx is upfront investment in physical assets. Cloud shifts this to usage-based OpEx." },
  { id: "c4", domain: "concepts", type: "single",
    q: "Which cloud service model gives you the greatest level of control over the operating system?",
    options: ["SaaS", "PaaS", "IaaS", "FaaS"],
    correct: 2,
    ex: "Infrastructure as a Service provides the greatest control over the operating system, middleware, and applications. Platform as a Service abstracts the operating system, while Software as a Service abstracts most of the underlying infrastructure." },
  { id: "c5", domain: "concepts", type: "single",
    q: "Which cloud service model is used by Microsoft 365 and Dynamics 365?",
    options: ["IaaS", "PaaS", "SaaS", "Hybrid"],
    correct: 2,
    ex: "Microsoft 365 and Dynamics 365 are examples of Software as a Service, where the provider manages the underlying infrastructure and platform." },
  { id: "c6", domain: "concepts", type: "single",
    q: "An organization maintains regulated data on-premises and uses Azure to handle peak workloads. Which cloud deployment model is being used?",
    options: ["Public cloud", "Private cloud", "Hybrid cloud", "Community cloud"],
    correct: 2,
    ex: "A hybrid cloud model combines on-premises infrastructure with public cloud services, enabling workloads to move between environments based on business and compliance requirements." },
  { id: "c7", domain: "concepts", type: "single",
    q: "Which benefit is most closely associated with serverless compute such as Azure Functions?",
    options: ["Full control of the host operating system", "No infrastructure to manage and billing based on execution", "A permanent dedicated virtual machine", "Unlimited free compute"],
    correct: 1,
    ex: "Serverless compute abstracts infrastructure management and charges customers only when code executes." },
  { id: "c8", domain: "concepts", type: "single",
    q: "Which term describes the ability to restore services after a significant event such as a regional outage?",
    options: ["Elasticity", "Disaster recovery", "Agility", "Scalability"],
    correct: 1,
    ex: "Disaster recovery is the process of restoring services and data after a major disruption or outage." },
  { id: "c9", domain: "concepts", type: "single",
    q: "Which statement best describes the cloud benefit of agility?",
    options: ["Lower total cost", "Rapidly provisioning and deprovisioning resources", "Higher network speed", "Stronger encryption"],
    correct: 1,
    ex: "Agility refers to the ability to quickly deploy and retire resources in response to changing business needs." },
  { id: "c10", domain: "concepts", type: "multi",
    q: "Which TWO benefits are typically associated with the public cloud? (Choose two.)",
    options: ["No upfront hardware capacity planning", "Ownership of physical servers", "High, on-demand scalability", "Guaranteed zero cost"],
    correct: [0, 2],
    ex: "The public cloud reduces the need for upfront hardware planning and provides elastic, on-demand scalability. Customers do not own the underlying hardware, and there is no guarantee of zero cost." },
  { id: "c11", domain: "concepts", type: "multi",
    q: "Which TWO responsibilities always remain with the customer in every cloud service model? (Choose two.)",
    options: ["Data and information", "Physical datacentre security", "Accounts and identities", "Physical host patching"],
    correct: [0, 2],
    ex: "Customers remain responsible for protecting their data and managing accounts and identities. Physical datacentre security and host maintenance remain the provider's responsibility in all cloud service models." },
  { id: "c12", domain: "concepts", type: "yesno",
    q: "For each statement about the shared responsibility model, select Yes if the statement is correct. Otherwise, select No.",
    statements: [
      { text: "In an Infrastructure as a Service (IaaS) environment, the customer is responsible for the physical security of the datacentre.", ans: false },
      { text: "In every cloud service model, the customer is responsible for data and identities.", ans: true },
      { text: "In a Software as a Service (SaaS) environment, the customer is responsible for patching the operating system.", ans: false },
    ],
    ex: "Physical security is the provider's responsibility in every model. Customers remain responsible for their data and identities. In SaaS, the provider manages the operating system and its patching." },
  { id: "c13", domain: "concepts", type: "dragdrop",
    q: "Match each cloud service model to its description.",
    tokens: ["IaaS", "PaaS", "SaaS"],
    targets: [
      { label: "You manage the OS and applications; the provider manages the hardware", token: "IaaS" },
      { label: "The provider manages the OS; you deploy your code and data", token: "PaaS" },
      { label: "The provider manages everything; you simply consume the application", token: "SaaS" },
    ],
    ex: "IaaS = you keep the OS. PaaS = provider runs the platform, you bring code. SaaS = fully managed application." },
  { id: "c14", domain: "concepts", type: "single",
    q: "Which benefit describes a cloud provider's ability to keep systems running despite a component failure?",
    options: ["Elasticity", "Fault tolerance", "Consumption model", "Agility"],
    correct: 1,
    ex: "Fault tolerance keeps a system operating even when a component fails, usually through redundancy." },
  { id: "c15", domain: "concepts", type: "dropdown",
    q: "Complete the sentence about cloud economics.",
    parts: [
      { text: "Moving from buying servers to renting cloud capacity shifts spending from " },
      { options: ["OpEx", "CapEx"], correct: 1 },
      { text: " to " },
      { options: ["OpEx", "CapEx"], correct: 0 },
      { text: "." },
    ],
    ex: "Owning hardware is CapEx (upfront). Paying for cloud usage over time is OpEx (operating cost)." },
  { id: "c16", domain: "concepts", type: "single",
    q: "Which statement best describes scalability in the cloud?",
    options: ["Recovering after an outage", "The ability to increase or decrease resources as needed", "Owning your own datacentre", "Encrypting data at rest"],
    correct: 1,
    ex: "Scalability refers to the ability to increase or decrease resource capacity to meet demand." },
  { id: "c17", domain: "concepts", type: "single",
    q: "Which statement best describes vertical scaling?",
    options: ["Adding more identical instances", "Increasing the resources of an existing instance, such as CPU or memory", "Moving to another region", "Reducing the number of instances"],
    correct: 1,
    ex: "Vertical scaling increases the capacity of an existing resource, while horizontal scaling adds additional instances." },
  { id: "c18", domain: "concepts", type: "single",
    q: "Which cloud deployment model is used exclusively by a single organization and may be hosted on-premises or in a dedicated datacentre?",
    options: ["Public cloud", "Private cloud", "Hybrid cloud", "Multi-tenant cloud"],
    correct: 1,
    ex: "A private cloud is dedicated to a single organization and can be hosted on-premises or in a dedicated environment, providing greater control and isolation." },

  /* ---------- ARCHITECTURE & SERVICES ---------- */
  { id: "a1", domain: "architecture", type: "single",
    q: "Which Azure resource is the logical container for related resources that share the same lifecycle?",
    options: ["Management group", "Subscription", "Resource group", "Region"],
    correct: 2,
    ex: "A resource group is the logical container for related Azure resources and is commonly used to manage their lifecycle together." },
  { id: "a2", domain: "architecture", type: "single",
    q: "Which Azure construct allows you to apply governance and policy to multiple subscriptions at the same time?",
    options: ["Resource group", "Management group", "Availability zone", "Region pair"],
    correct: 1,
    ex: "Management groups provide a governance layer above subscriptions and allow policy and access controls to be applied consistently across many subscriptions." },
  { id: "a3", domain: "architecture", type: "single",
    q: "Availability zones within a region primarily protect a workload against what?",
    options: ["Region-wide disasters", "The failure of a single datacentre in that region", "Subscription billing errors", "DNS misconfiguration"],
    correct: 1,
    ex: "Availability zones are physically separate datacentres inside one region, guarding against a single-datacentre failure." },
  { id: "a4", domain: "architecture", type: "single",
    q: "Which Azure service provides a managed Kubernetes environment for deploying and orchestrating containerized applications?",
    options: ["Azure Container Instances", "Azure Kubernetes Service (AKS)", "Azure App Service", "Azure Batch"],
    correct: 1,
    ex: "Azure Kubernetes Service is a managed Kubernetes service that simplifies the deployment, scaling, and management of containerized workloads." },
  { id: "a5", domain: "architecture", type: "single",
    q: "You need to host a web application without managing the operating system or web server. Which Azure service should you use?",
    options: ["Azure Virtual Machines", "Azure App Service", "Azure Container Instances", "Azure Virtual Network"],
    correct: 1,
    ex: "Azure App Service is a Platform as a Service offering for hosting web applications and APIs without managing the underlying operating system or web server." },
  { id: "a6", domain: "architecture", type: "single",
    q: "Which Azure Storage redundancy option replicates data across three availability zones in the primary region?",
    options: ["LRS", "ZRS", "GRS", "RA-GRS"],
    correct: 1,
    ex: "Zone-redundant storage replicates across three availability zones in the primary region. LRS copies within a single datacentre; GRS replicates to a secondary region." },
  { id: "a7", domain: "architecture", type: "single",
    q: "Which storage access tier is cheapest to store but most costly to access, for rarely-used data?",
    options: ["Hot", "Cool", "Cold", "Archive"],
    correct: 3,
    ex: "Archive has the lowest storage cost, highest access cost and latency; for long-term, rarely-read data." },
  { id: "a8", domain: "architecture", type: "single",
    q: "Which Azure service provides a private connection to Azure that does not traverse the public internet?",
    options: ["VPN Gateway", "ExpressRoute", "Azure Bastion", "Application Gateway"],
    correct: 1,
    ex: "ExpressRoute provides a private, dedicated connection between an on-premises network and Azure, without using the public internet." },
  { id: "a9", domain: "architecture", type: "single",
    q: "What is Microsoft Entra ID primarily used for?",
    options: ["Virtual machine hosting", "Identity and access management", "Object storage", "Load balancing"],
    correct: 1,
    ex: "Microsoft Entra ID is used for identity and access management, including authentication, single sign-on, and Conditional Access." },
  { id: "a9b", domain: "architecture", type: "single",
    q: "Your organization plans to migrate an on-premises Active Directory environment to Azure. Which Microsoft service should you use to provide centralized identity and access management for cloud-based resources?",
    options: ["Azure Backup", "Microsoft Entra ID", "Azure Monitor", "Azure Files"],
    correct: 1,
    ex: "Microsoft Entra ID provides centralized identity and access management for Microsoft cloud services and enables secure access to Azure resources." },
  { id: "a9c", domain: "architecture", type: "single",
    q: "Your company is migrating a large on-premises Active Directory forest to Azure. Which approach best supports identity services for a hybrid environment that includes Microsoft cloud-based applications and workloads?",
    options: ["Deploy a standalone Azure VM for each user account", "Use Microsoft Entra ID to manage identities and access for cloud resources", "Store all identities in Azure Blob Storage", "Disable directory synchronization and create new accounts manually"],
    correct: 1,
    ex: "Microsoft Entra ID is designed for centralized identity management in Microsoft cloud environments and supports hybrid access scenarios for users and applications." },
  { id: "a10", domain: "architecture", type: "single",
    q: "The management layer that receives every request to create, update or delete Azure resources is:",
    options: ["Azure Monitor", "Azure Resource Manager (ARM)", "Azure Advisor", "Azure Policy"],
    correct: 1,
    ex: "ARM is the deployment/management layer; portal, CLI, PowerShell and SDKs all route requests through it." },
  { id: "a11", domain: "architecture", type: "single",
    q: "You want virtual machines to scale out automatically when CPU utilization increases. Which Azure feature should you use?",
    options: ["Availability sets", "Virtual Machine Scale Sets", "Azure Functions", "Resource locks"],
    correct: 1,
    ex: "Virtual Machine Scale Sets are used to deploy and automatically scale identical, load-balanced virtual machines based on demand." },
  { id: "a12", domain: "architecture", type: "single",
    q: "Which Azure service distributes inbound network traffic across multiple virtual machines at layer 4?",
    options: ["Azure DNS", "Azure Load Balancer", "VPN Gateway", "Azure Firewall"],
    correct: 1,
    ex: "Azure Load Balancer operates at layer 4 and distributes traffic across healthy backend resources." },
  { id: "a13", domain: "architecture", type: "single",
    q: "Which statement best describes an Azure region pair?",
    options: ["Two datacentres in a single building for local redundancy", "Two Azure regions in the same geography, separated by at least 300 miles, used for replication and staggered platform updates", "Two subscriptions linked for billing and cost allocation", "A primary region and a backup availability zone within the same datacentre"],
    correct: 1,
    ex: "An Azure region pair consists of two regions within the same geography, separated by a significant distance to support disaster recovery and maintenance sequencing." },
  { id: "a14", domain: "architecture", type: "single",
    q: "Which Azure Storage service is designed to store large amounts of unstructured data such as images, videos, and backups?",
    options: ["Azure Files", "Azure Blob Storage", "Azure Queue Storage", "Azure Table Storage"],
    correct: 1,
    ex: "Azure Blob Storage is optimized for storing unstructured object data, including documents, media files, and backup data." },
  { id: "a15", domain: "architecture", type: "single",
    q: "Which Azure service provides managed file shares that are accessible by using SMB and NFS protocols?",
    options: ["Azure Blob Storage", "Azure Files", "Azure Disk Storage", "Azure Queue Storage"],
    correct: 1,
    ex: "Azure Files provides fully managed cloud file shares that can be accessed by using SMB and NFS." },
  { id: "a16", domain: "architecture", type: "single",
    q: "Which statement accurately describes the difference between authentication and authorization?",
    options: ["Authentication grants permissions; authorization verifies identity", "Authentication verifies identity; authorization determines what an authenticated user can access", "Authentication and authorization are identical processes", "Authorization occurs before authentication in every Azure sign-in flow"],
    correct: 1,
    ex: "Authentication confirms a user's identity, while authorization determines the permissions and access that the identity is allowed to use." },
  { id: "a17", domain: "architecture", type: "single",
    q: "Which statement best describes multi-factor authentication (MFA)?",
    options: ["Two passwords are required for sign-in", "Two or more factors from different categories are required to authenticate", "A longer single password is required for each login", "Only biometric factors can be used for MFA"],
    correct: 1,
    ex: "MFA requires factors from different categories, such as something the user knows, possesses, or is, to strengthen authentication." },
  { id: "a18", domain: "architecture", type: "single",
    q: "Which Microsoft Entra feature evaluates signals such as user location, device state, and sign-in risk before allowing access to a resource?",
    options: ["Conditional Access", "Resource locks", "Azure Policy", "Availability zones"],
    correct: 0,
    ex: "Conditional Access applies access decisions based on conditions such as location, device compliance, and risk level." },
  { id: "a19", domain: "architecture", type: "single",
    q: "Which Azure service enables secure remote access to a virtual machine without exposing RDP or SSH ports to the public internet?",
    options: ["Azure Bastion", "Azure DNS", "Azure Advisor", "Azure Monitor"],
    correct: 0,
    ex: "Azure Bastion provides secure browser-based connectivity to Azure virtual machines without requiring public IP addresses on those VMs." },
  { id: "a20", domain: "architecture", type: "multi",
    q: "Which TWO are valid Azure compute options for running containers? (Choose two.)",
    options: ["Azure Container Instances", "Azure Blob Storage", "Azure Kubernetes Service", "Azure DNS"],
    correct: [0, 2],
    ex: "ACI runs individual containers; AKS orchestrates them at scale. Blob and DNS are not compute." },
  { id: "a21", domain: "architecture", type: "multi",
    q: "Which TWO services provide connectivity between an on-premises network and an Azure virtual network? (Choose two.)",
    options: ["VPN Gateway", "Azure Blob Storage", "ExpressRoute", "Azure Advisor"],
    correct: [0, 2],
    ex: "A VPN Gateway provides encrypted connectivity over the internet, and ExpressRoute provides a private, dedicated connection between on-premises infrastructure and Azure." },
  { id: "a22", domain: "architecture", type: "dragdrop",
    q: "Match each Azure service to its category.",
    tokens: ["Azure Functions", "Blob Storage", "Virtual Network", "Microsoft Entra ID"],
    targets: [
      { label: "Compute", token: "Azure Functions" },
      { label: "Storage", token: "Blob Storage" },
      { label: "Networking", token: "Virtual Network" },
      { label: "Identity", token: "Microsoft Entra ID" },
    ],
    ex: "Functions = compute, Blob = storage, Virtual Network = networking, Entra ID = identity." },
  { id: "a23", domain: "architecture", type: "dragdrop",
    q: "Match each storage redundancy option to the scope of its replication.",
    tokens: ["LRS", "ZRS", "GRS"],
    targets: [
      { label: "Copies within a single datacentre", token: "LRS" },
      { label: "Copies across zones in the primary region", token: "ZRS" },
      { label: "Copies to a secondary region", token: "GRS" },
    ],
    ex: "LRS = one datacentre; ZRS = zones in one region; GRS = a paired secondary region." },
  { id: "a24", domain: "architecture", type: "yesno",
    q: "For each statement about Azure regions and zones, select Yes if correct, otherwise No.",
    statements: [
      { text: "An availability zone is a physically separate datacentre within an Azure region.", ans: true },
      { text: "Every Azure region supports availability zones.", ans: false },
      { text: "The two regions in a region pair are located within the same region.", ans: false },
    ],
    ex: "Zones are separate datacentres in a region. Not all regions have zones. A region pair spans two different regions." },
  { id: "a25", domain: "architecture", type: "yesno",
    q: "For each statement about identity, select Yes if correct, otherwise No.",
    statements: [
      { text: "MFA can require two forms of the same factor, such as two passwords.", ans: false },
      { text: "Single sign-on lets a user authenticate once to access multiple applications.", ans: true },
      { text: "Conditional Access can require MFA based on sign-in risk.", ans: true },
    ],
    ex: "MFA needs different factor types. SSO gives one sign-in across apps. Conditional Access reacts to risk signals." },
  { id: "a26", domain: "architecture", type: "dropdown",
    q: "Complete the sentence about hybrid connectivity.",
    parts: [
      { text: "To connect on-premises to Azure over the public internet, use a " },
      { options: ["VPN Gateway", "ExpressRoute"], correct: 0 },
      { text: "; for a private dedicated link that avoids the internet, use " },
      { options: ["VPN Gateway", "ExpressRoute"], correct: 1 },
      { text: "." },
    ],
    ex: "VPN Gateway = encrypted tunnel over the internet. ExpressRoute = private, dedicated connection." },
  { id: "a27", domain: "architecture", type: "single",
    q: "Where can customers find and deploy third-party and Microsoft solutions (VM images, services) in Azure?",
    options: ["Azure Advisor", "Azure Marketplace", "Azure Monitor", "Cloud Shell"],
    correct: 1,
    ex: "Azure Marketplace is the online store for finding and deploying certified solutions and VM images." },
  { id: "a28", domain: "architecture", type: "single",
    q: "Which service is a globally distributed, multi-model NoSQL database with low-latency reads and writes?",
    options: ["Azure SQL Database", "Azure Cosmos DB", "Azure Blob Storage", "Azure Table Storage"],
    correct: 1,
    ex: "Azure Cosmos DB is a globally distributed, multi-model database offering single-digit-millisecond latency." },
  { id: "a29", domain: "architecture", type: "single",
    q: "Which desktop virtualization service delivers Windows desktops and apps from Azure?",
    options: ["Azure Virtual Desktop", "Azure Bastion", "Azure App Service", "Azure Functions"],
    correct: 0,
    ex: "Azure Virtual Desktop provides virtualized Windows desktops and applications hosted in Azure." },
  { id: "a30", domain: "architecture", type: "single",
    q: "An availability set primarily helps protect virtual machines against:",
    options: ["Region-wide failures", "Hardware failures and planned maintenance within a datacentre", "Billing errors", "Expired certificates"],
    correct: 1,
    ex: "Availability sets distribute virtual machines across fault and update domains to reduce the impact of localized hardware failures and maintenance events." },

  /* ---------- MANAGEMENT & GOVERNANCE ---------- */
  { id: "g1", domain: "governance", type: "single",
    q: "Which Azure tool estimates the cost of services before deployment?",
    options: ["Azure Advisor", "Azure Pricing Calculator", "Azure Monitor", "Cost Management + Billing"],
    correct: 1,
    ex: "The Pricing Calculator estimates the cost of a planned Azure deployment. The TCO Calculator compares on-premises and Azure costs." },
  { id: "g2", domain: "governance", type: "single",
    q: "Which Azure tool compares the cost of running workloads on-premises with the cost of running them in Azure?",
    options: ["Pricing Calculator", "Total Cost of Ownership (TCO) Calculator", "Azure Advisor", "Service Health"],
    correct: 1,
    ex: "The TCO Calculator estimates potential cost savings and benefits of migrating workloads from on-premises infrastructure to Azure." },
  { id: "g3", domain: "governance", type: "single",
    q: "Which Azure service provides personalized recommendations to improve cost, security, reliability, performance, and operational excellence?",
    options: ["Azure Monitor", "Azure Advisor", "Azure Policy", "Azure Blueprints"],
    correct: 1,
    ex: "Azure Advisor analyzes resource usage and provides recommendations to optimize cost, security, reliability, performance, and operational efficiency." },
  { id: "g4", domain: "governance", type: "single",
    q: "Your organization requires all new Azure resources to be deployed only in European regions. Which Azure service should you use to enforce this requirement?",
    options: ["Azure Advisor", "Azure Policy", "Resource locks", "Azure Monitor"],
    correct: 1,
    ex: "Azure Policy allows you to define and enforce rules such as allowed locations, ensuring that resources are only deployed in approved regions." },
  { id: "g5", domain: "governance", type: "single",
    q: "Which Azure feature prevents a resource from being deleted or modified, regardless of role-based access control permissions?",
    options: ["Azure Policy", "Resource locks", "Tags", "Management groups"],
    correct: 1,
    ex: "Resource locks such as CanNotDelete or ReadOnly prevent accidental changes or deletion regardless of RBAC permissions." },
  { id: "g6", domain: "governance", type: "single",
    q: "What is the primary purpose of applying tags to Azure resources?",
    options: ["To encrypt the resource", "To organize resources and support cost allocation and reporting", "To boost performance", "To restrict deployment regions"],
    correct: 1,
    ex: "Tags provide metadata that can be used to organize resources, identify ownership, and support cost allocation and reporting." },
  { id: "g7", domain: "governance", type: "single",
    q: "Which Azure service collects metrics and logs to help you understand the performance and health of your resources?",
    options: ["Azure Monitor", "Azure Policy", "Azure Advisor", "Azure Blueprints"],
    correct: 0,
    ex: "Azure Monitor collects metrics and logs that can be used to analyze performance, availability, and operational health." },
  { id: "g8", domain: "governance", type: "single",
    q: "Which Azure service provides information about service incidents, planned maintenance, and health advisories affecting your resources?",
    options: ["Azure Advisor", "Azure Service Health", "Azure Policy", "Cost Management"],
    correct: 1,
    ex: "Azure Service Health provides personalized alerts and information about Azure service issues, planned maintenance, and health advisories." },
  { id: "g9", domain: "governance", type: "single",
    q: "An Azure Service Level Agreement (SLA) defines:",
    options: ["The price of a service", "The guaranteed availability/performance commitment and remedies", "The number of regions", "The encryption standard"],
    correct: 1,
    ex: "An SLA is a formal availability/performance commitment, with service credits as the remedy if it is missed." },
  { id: "g10", domain: "governance", type: "single",
    q: "Do Azure services in 'preview' typically carry a full production SLA?",
    options: ["Yes, always", "No — preview features generally have no SLA or a reduced one", "Only paid previews", "Preview and GA are identical"],
    correct: 1,
    ex: "Preview features are for evaluation and usually have no SLA. Full SLAs apply once a service reaches general availability." },
  { id: "g11", domain: "governance", type: "single",
    q: "Which Microsoft service helps an organization govern, classify, and protect data across its environment to support compliance and risk management?",
    options: ["Microsoft Purview", "Azure Monitor", "Azure Advisor", "Azure Bastion"],
    correct: 0,
    ex: "Microsoft Purview provides data governance, classification, and compliance capabilities across an organization's data estate." },
  { id: "g12", domain: "governance", type: "single",
    q: "Which Azure resource is the billing boundary for resources contained in a resource group?",
    options: ["Management group", "Subscription", "Region", "Tenant"],
    correct: 1,
    ex: "A subscription is the billing and access boundary for resources; resource groups are created inside a subscription." },
  { id: "g13", domain: "governance", type: "single",
    q: "Where can you find Microsoft's audit reports and compliance documentation (ISO, SOC, etc.)?",
    options: ["Azure Advisor", "Microsoft Service Trust Portal / Trust Center", "Azure Monitor", "Cloud Shell"],
    correct: 1,
    ex: "The Service Trust Portal and Trust Center publish compliance offerings, audit reports and security documentation." },
  { id: "g14", domain: "governance", type: "single",
    q: "Which access model grants users the minimum permissions required to perform their job functions?",
    options: ["Assign everyone Owner", "Azure Role-Based Access Control (RBAC)", "Resource locks", "Tags"],
    correct: 1,
    ex: "Azure RBAC enables least-privilege access by assigning specific roles to users, groups, or applications at a defined scope." },
  { id: "g15", domain: "governance", type: "single",
    q: "Azure Cloud Shell's key advantage is that it:",
    options: ["Provides a free VM", "Is a browser-based shell (Bash or PowerShell) needing no local install", "Gives unlimited storage", "Enforces policy automatically"],
    correct: 1,
    ex: "Cloud Shell is an authenticated, browser-based Bash/PowerShell environment with nothing to install locally." },
  { id: "g16", domain: "governance", type: "multi",
    q: "Which TWO interfaces let you manage Azure from a command line? (Choose two.)",
    options: ["Azure CLI", "Azure Monitor", "Azure PowerShell", "Azure Advisor"],
    correct: [0, 2],
    ex: "Azure CLI and Azure PowerShell are both command-line tools, also available inside Cloud Shell." },
  { id: "g17", domain: "governance", type: "multi",
    q: "Which TWO capabilities are provided by Microsoft Cost Management? (Choose two.)",
    options: ["Monitoring and analyzing Azure spend", "Enforcing allowed regions", "Setting budgets and alerts", "Scaling virtual machines"],
    correct: [0, 2],
    ex: "Cost Management helps organizations monitor and analyze Azure spending and configure budgets with alerts. Enforcement of allowed regions is handled by Azure Policy." },
  { id: "g18", domain: "governance", type: "dragdrop",
    q: "Match each cost/governance tool to its purpose.",
    tokens: ["Pricing Calculator", "TCO Calculator", "Azure Advisor", "Azure Policy"],
    targets: [
      { label: "Estimate the cost of a planned deployment", token: "Pricing Calculator" },
      { label: "Compare on-premises cost with Azure", token: "TCO Calculator" },
      { label: "Get recommendations to optimize resources", token: "Azure Advisor" },
      { label: "Enforce rules such as allowed regions", token: "Azure Policy" },
    ],
    ex: "Pricing = estimate future spend; TCO = on-prem vs Azure; Advisor = recommendations; Policy = enforcement." },
  { id: "g19", domain: "governance", type: "dragdrop",
    q: "Match each management scope to what it governs.",
    tokens: ["Management group", "Subscription", "Resource group"],
    targets: [
      { label: "Applies policy across many subscriptions", token: "Management group" },
      { label: "Acts as a billing and access boundary", token: "Subscription" },
      { label: "Groups resources with a shared lifecycle", token: "Resource group" },
    ],
    ex: "Management group > subscription > resource group, from broad governance down to grouped resources." },
  { id: "g20", domain: "governance", type: "yesno",
    q: "For each governance statement, select Yes if correct, otherwise No.",
    statements: [
      { text: "Azure Policy can block creation of resources in disallowed regions.", ans: true },
      { text: "A resource lock set to ReadOnly allows the resource to be modified but not deleted.", ans: false },
      { text: "Tags can be used to group resources for cost reporting.", ans: true },
    ],
    ex: "Policy can restrict regions. A ReadOnly lock blocks both modification and deletion. Tags aid cost grouping." },
  { id: "g21", domain: "governance", type: "yesno",
    q: "For each statement about monitoring and support, select Yes if correct, otherwise No.",
    statements: [
      { text: "Application Insights focuses on application performance monitoring.", ans: true },
      { text: "Azure Service Health shows outages affecting your specific services.", ans: true },
      { text: "Azure Advisor is used mainly to view your invoices.", ans: false },
    ],
    ex: "App Insights = app performance. Service Health = personalized service issues. Advisor = recommendations, not billing." },
  { id: "g22", domain: "governance", type: "dropdown",
    q: "Complete the sentence about Azure cost estimation tools.",
    parts: [
      { text: "Use the " },
      { options: ["Pricing Calculator", "TCO Calculator"], correct: 0 },
      { text: " to estimate the cost of a planned deployment, and the " },
      { options: ["Pricing Calculator", "TCO Calculator"], correct: 1 },
      { text: " to compare on-premises costs with Azure." },
    ],
    ex: "The Pricing Calculator estimates the cost of planned Azure services, while the TCO Calculator compares on-premises costs with Azure." },
  { id: "g23", domain: "governance", type: "single",
    q: "Which built-in role gives full management access to a scope, including granting access to others?",
    options: ["Reader", "Contributor", "Owner", "Guest"],
    correct: 2,
    ex: "Owner has full access and can delegate access. Contributor manages resources but can't grant access; Reader is view-only." },
  { id: "g24", domain: "governance", type: "single",
    q: "Infrastructure as Code in Azure is commonly achieved using which of the following?",
    options: ["ARM templates / Bicep", "Azure Advisor", "Service Health", "Resource locks"],
    correct: 0,
    ex: "ARM templates (and Bicep) declaratively define infrastructure so deployments are repeatable and version-controlled." },
];

/* ------------------------------------------------------------------ */
/*  SCORING & HELPERS                                                 */
/* ------------------------------------------------------------------ */
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const setEq = (x, y) => [...x].sort().join(",") === [...y].sort().join(",");

function initAnswer(q) {
  switch (q.type) {
    case "single":
    case "multi": return { sel: [] };
    case "dragdrop": return { map: {} }; // targetIdx -> token
    case "yesno": return { ans: q.statements.map(() => null) };
    case "dropdown": return { pick: q.parts.filter((p) => p.options).map(() => null) };
    default: return {};
  }
}
function isAnswered(q, a) {
  if (!a) return false;
  switch (q.type) {
    case "single":
    case "multi": return a.sel.length > 0;
    case "dragdrop": return Object.keys(a.map).length > 0;
    case "yesno": return a.ans.some((x) => x !== null);
    case "dropdown": return a.pick.some((x) => x !== null);
    default: return false;
  }
}
function isComplete(q, a) {
  if (!a) return false;
  switch (q.type) {
    case "single": return a.sel.length === 1;
    case "multi": return a.sel.length === q.correct.length;
    case "dragdrop": return q.targets.every((_, i) => a.map[i]);
    case "yesno": return a.ans.every((x) => x !== null);
    case "dropdown": return a.pick.every((x) => x !== null);
    default: return false;
  }
}
function isCorrect(q, a) {
  if (!a) return false;
  switch (q.type) {
    case "single": return a.sel.length === 1 && a.sel[0] === q.correct;
    case "multi": return a.sel.length > 0 && setEq(a.sel, q.correct);
    case "dragdrop": return q.targets.every((t, i) => a.map[i] === t.token);
    case "yesno": return q.statements.every((s, i) => a.ans[i] === s.ans);
    case "dropdown": {
      const blanks = q.parts.filter((p) => p.options);
      return blanks.every((b, i) => a.pick[i] === b.correct);
    }
    default: return false;
  }
}

/* weighted exam draw ~30/40/30, backfilled to n */
function buildExam(n) {
  const keys = Object.keys(DOMAINS);
  let alloc = 0, out = [];
  keys.forEach((k, i) => {
    const take = i === keys.length - 1 ? n - alloc : Math.round(n * DOMAINS[k].weight);
    alloc += take;
    out = out.concat(shuffle(BANK.filter((q) => q.domain === k)).slice(0, take));
  });
  if (out.length < n) {
    const have = new Set(out.map((q) => q.id));
    out = out.concat(shuffle(BANK.filter((q) => !have.has(q.id))).slice(0, n - out.length));
  }
  return shuffle(out).slice(0, n);
}

const scaled = (frac) => Math.max(1, Math.round(frac * 1000));

/* ------------------------------------------------------------------ */
/*  PALETTE                                                           */
/* ------------------------------------------------------------------ */
// dark shell (landing + report)
const D = {
  bg: "#0b1220", surface: "#111b2e", surface2: "#16223a", border: "#243349",
  borderSoft: "#1c2a41", text: "#e9eef7", muted: "#8ea1c0", faint: "#5f708c",
  accent: "#4aa3ff", accentDeep: "#2b6fd6", good: "#3ddc97", goodBg: "#0f2a22",
  bad: "#ff6b7d", badBg: "#2b1420", amber: "#f5c86b",
};
// light exam runner (testing software look)
const E = {
  bg: "#eef1f5", pane: "#ffffff", bar: "#0a3d6e", barText: "#eaf2fb",
  border: "#d3d9e2", borderStrong: "#b6c0cd", text: "#1e2733", sub: "#5a6675",
  blue: "#0067c0", blueSoft: "#e8f1fb", sel: "#cfe4fb", selBorder: "#0067c0",
  flag: "#e0952b", flagSoft: "#fdf3e2", good: "#1a8a53", bad: "#c0392b",
};
const mono = 'ui-monospace,"SF Mono","Cascadia Code","JetBrains Mono",Menlo,monospace';
const sans = 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

/* ================================================================== */
export default function App() {
  const [screen, setScreen] = useState("home"); // home | intro | exam | report
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [cfg, setCfg] = useState(null);      // {label, count, minutes, domain}
  const [session, setSession] = useState(null); // built exam session
  const [report, setReport] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let localHistory = [];
      let remoteHistory = null;
      try {
        const profile = await storage.get(USER_KEY);
        if (alive && profile?.value) setProfileId(profile.value);
      } catch {}

      try {
        const r = await storage.get(STORE_KEY);
        if (r?.value) localHistory = JSON.parse(r.value);
      } catch {}

      if (alive && profileId && canRemote) {
        remoteHistory = await remoteGet(profileId);
      }

      if (alive) {
        const next = remoteHistory !== null ? (remoteHistory.length ? remoteHistory : localHistory) : localHistory;
        setHistory(next);
        setLoaded(true);
        if (remoteHistory !== null) {
          setSyncStatus("synced");
          if (next !== localHistory) {
            try { await storage.set(STORE_KEY, JSON.stringify(next)); } catch {}
          }
        }
      }
    })();
    return () => { alive = false; };
  }, [profileId]);

  const persist = useCallback(async (next) => {
    setHistory(next);
    try { await storage.set(STORE_KEY, JSON.stringify(next)); } catch {}
    if (profileId && canRemote) {
      const ok = await remoteSet(profileId, next);
      setSyncStatus(ok ? "synced" : "remote-failed");
    }
  }, [profileId]);

  const configure = (c) => {
    let qs;
    if (c.domain) qs = shuffle(BANK.filter((q) => q.domain === c.domain));
    else qs = buildExam(c.count);
    const count = c.count || qs.length;
    setCfg({ ...c, count });
    setSession({
      questions: qs.slice(0, count),
      answers: qs.slice(0, count).map((q) => initAnswer(q)),
      flags: qs.slice(0, count).map(() => false),
      idx: 0,
      minutes: c.minutes,
    });
    setScreen("intro");
  };

  const grade = useCallback(async (sess, timedOut) => {
    const { questions, answers } = sess;
    let correct = 0; const per = {};
    questions.forEach((q, i) => {
      const ok = isCorrect(q, answers[i]);
      if (ok) correct++;
      const d = per[q.domain] || { correct: 0, total: 0 };
      d.total++; if (ok) d.correct++; per[q.domain] = d;
    });
    const frac = correct / questions.length;
    const isExam = !cfg.domain;
    const r = {
      date: Date.now(), label: cfg.label, domain: cfg.domain || "all", exam: isExam,
      total: questions.length, correct, score: scaled(frac),
      passed: isExam ? scaled(frac) >= PASS_MARK : null, timedOut: !!timedOut, per,
      // keep the sitting for answer review
      review: questions.map((q, i) => ({ q, a: answers[i], ok: isCorrect(q, answers[i]) })),
    };
    setReport(r);
    const slim = { ...r }; delete slim.review; // don't bloat storage with full questions
    await persist([slim, ...history].slice(0, 60));
    setScreen("report");
  }, [cfg, history, persist]);

  const clearHistory = async () => {
    setHistory([]);
    try { await storage.delete(STORE_KEY); } catch {}
    if (profileId && canRemote) {
      await remoteDelete(profileId);
    }
  };

  const saveProfile = async (id) => {
    const trimmed = id.trim();
    setProfileId(trimmed);
    try { await storage.set(USER_KEY, trimmed); } catch {}
    if (trimmed && canRemote) {
      const remoteHistory = await remoteGet(trimmed);
      if (remoteHistory !== null) {
        const next = remoteHistory.length ? remoteHistory : history;
        setHistory(next);
        await storage.set(STORE_KEY, JSON.stringify(next));
        await remoteSet(trimmed, next);
        setSyncStatus("synced");
      } else {
        setSyncStatus("remote-failed");
      }
    }
  };

  const clearProfile = async () => {
    setProfileId("");
    try { await storage.delete(USER_KEY); } catch {}
    setSyncStatus("");
  };

  return (
    <div style={{ minHeight: "100vh", background: screen === "exam" || screen === "intro" ? E.bg : D.bg, fontFamily: sans }}>
      <style>{`
        *{box-sizing:border-box}
        button{font-family:inherit;cursor:pointer}
        button:focus-visible,[tabindex]:focus-visible{outline:2px solid ${E.blue};outline-offset:2px}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .fade{animation:fadeIn .25s ease both}
        .bar{transition:width .5s cubic-bezier(.2,.7,.2,1)}
        @media (prefers-reduced-motion:reduce){.fade{animation:none}.bar{transition:none}}
      `}</style>

      {!loaded ? (
        <div style={{ color: D.muted, padding: 60, textAlign: "center" }}>Loading…</div>
      ) : screen === "home" ? (
        <Home
          history={history}
          onConfigure={configure}
          onClear={clearHistory}
          profileId={profileId}
          onSaveProfile={saveProfile}
          onClearProfile={clearProfile}
          syncStatus={syncStatus}
        />
      ) : screen === "intro" ? (
        <Intro cfg={cfg} onBegin={() => setScreen("exam")} onCancel={() => setScreen("home")} />
      ) : screen === "exam" ? (
        <ExamRunner cfg={cfg} session={session} setSession={setSession} onSubmit={(t) => grade(session, t)} />
      ) : (
        <Report report={report} onHome={() => setScreen("home")} onRetry={() => configure(cfg)} />
      )}
    </div>
  );
}

/* ================================================================== */
/*  HOME (dark, branded)                                              */
/* ================================================================== */
function Home({ history, onConfigure, onClear, profileId, onSaveProfile, onClearProfile, syncStatus }) {
  const [profileInput, setProfileInput] = useState(profileId);
  const exams = history.filter((h) => h.exam);
  const best = history.reduce((m, h) => Math.max(m, h.score), 0);
  const passed = exams.filter((h) => h.passed).length;

  const domAgg = useMemo(() => {
    const agg = {}; Object.keys(DOMAINS).forEach((k) => (agg[k] = { correct: 0, total: 0 }));
    history.forEach((h) => Object.entries(h.per || {}).forEach(([d, v]) => {
      if (!agg[d]) agg[d] = { correct: 0, total: 0 };
      agg[d].correct += v.correct; agg[d].total += v.total;
    }));
    return agg;
  }, [history]);

  useEffect(() => {
    setProfileInput(profileId);
  }, [profileId]);

  return (
    <div className="fade" style={{ maxWidth: 720, margin: "0 auto", padding: "30px 18px 70px", color: D.text }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 13, letterSpacing: 2, color: D.accent, border: `1px solid ${D.accentDeep}`, padding: "3px 9px", borderRadius: 6, background: "rgba(74,163,255,.08)" }}>AZ-900</span>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 650, letterSpacing: -0.4 }}>Azure Fundamentals — exam simulator</h1>
      </div>
      <p style={{ color: D.muted, margin: "0 0 22px", fontSize: 14.5 }}>
        Timed, proctored-style sittings that mirror the real exam: no feedback until you submit, flag &amp; review, {PASS_MARK}/1000 to pass.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <input value={profileInput} onChange={(e) => setProfileInput(e.target.value)}
          placeholder="Enter a sync ID to share scores across devices"
          style={{ flex: 1, minWidth: 220, borderRadius: 8, border: `1px solid ${D.border}`, padding: "10px 12px", background: D.surface, color: D.text }} />
        <button onClick={() => onSaveProfile(profileInput)}
          style={{ borderRadius: 8, border: 0, background: D.accent, color: "#fff", padding: "10px 16px", fontWeight: 600 }}>Save</button>
        {profileId ? (
          <button onClick={onClearProfile}
            style={{ borderRadius: 8, border: `1px solid ${D.border}`, background: "transparent", color: D.text, padding: "10px 16px" }}>Clear</button>
        ) : null}
      </div>
      <div style={{ color: D.muted, fontSize: 12, marginBottom: 18 }}>
        {profileId ? `Sync ID: ${profileId} — ${syncStatus === "synced" ? "Remote history enabled" : syncStatus === "remote-failed" ? "Remote sync failed" : "Sync ready"}` : "No sync ID configured. Scores are stored locally in this browser."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
        <Stat label="Best score" value={history.length ? best : "—"} sub="/ 1000" />
        <Stat label="Mock exams" value={exams.length ? `${passed}/${exams.length}` : "—"} sub="passed" />
        <Stat label="Sittings" value={history.length} sub={history.length === 1 ? "total" : "total"} />
      </div>

      <Label>Full simulation</Label>
      <Card accent title="Mock exam" tag="40 questions · 45:00"
        desc="Weighted to the real domain mix (30 / 40 / 30), mixed question types, timed. Scored with a pass/fail verdict."
        onClick={() => onConfigure({ label: "Mock exam", count: 40, minutes: 45 })} />
      <div style={{ height: 10 }} />
      <Card title="Short mock" tag="20 questions · 22:00"
        desc="A faster timed sitting under the same exam rules — good for a mid-week check."
        onClick={() => onConfigure({ label: "Short mock", count: 20, minutes: 22 })} />

      <Label>Practice by domain (timed, review at end)</Label>
      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(DOMAINS).map(([k, d]) => {
          const s = domAgg[k]; const pct = s.total ? Math.round((s.correct / s.total) * 100) : null;
          const n = BANK.filter((q) => q.domain === k).length;
          return (
            <Card key={k} title={d.label} tag={`${n} questions · ${Math.ceil(n * 0.9)}:00`}
              desc={pct === null ? "Not attempted yet." : `Lifetime accuracy: ${pct}% (${s.correct}/${s.total}).`}
              meter={pct}
              onClick={() => onConfigure({ label: d.label, domain: k, minutes: Math.ceil(n * 0.9) })} />
          );
        })}
      </div>

      {history.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28 }}>
            <Label noMargin>Recent sittings</Label>
            <button onClick={onClear} style={{ background: "none", border: `1px solid ${D.border}`, color: D.muted, fontSize: 12, padding: "4px 10px", borderRadius: 6 }}>Clear history</button>
          </div>
          <div style={{ marginTop: 12, border: `1px solid ${D.borderSoft}`, borderRadius: 10, overflow: "hidden" }}>
            {history.slice(0, 10).map((h, i) => (
              <div key={h.date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", fontSize: 14, borderTop: i ? `1px solid ${D.borderSoft}` : "none", background: i % 2 ? "transparent" : "rgba(255,255,255,.012)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 550 }}>
                    {h.label}
                    {h.exam && <span style={{ marginLeft: 8, fontSize: 11, fontFamily: mono, color: h.passed ? D.good : D.bad }}>{h.passed ? "PASS" : "FAIL"}</span>}
                    {h.timedOut && <span style={{ marginLeft: 6, fontSize: 11, color: D.amber }}>⏱ time</span>}
                  </div>
                  <div style={{ color: D.faint, fontSize: 12 }}>{fmtDate(h.date)} · {h.correct}/{h.total}</div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 17, color: scoreColor(h.score) }}>{h.score}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ border: `1px solid ${D.borderSoft}`, borderRadius: 10, padding: "13px 14px", background: D.surface }}>
      <div style={{ color: D.muted, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
      <div style={{ marginTop: 5, display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontFamily: mono, fontSize: 24, fontWeight: 600 }}>{value}</span>
        <span style={{ color: D.faint, fontSize: 12 }}>{sub}</span>
      </div>
    </div>
  );
}
function Label({ children, noMargin }) {
  return <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2, color: D.muted, margin: noMargin ? 0 : "24px 0 12px", fontFamily: mono }}>{children}</div>;
}
function Card({ title, tag, desc, onClick, accent, meter }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ textAlign: "left", width: "100%", padding: "15px 16px", borderRadius: 11, background: accent ? "rgba(74,163,255,.07)" : D.surface, border: `1px solid ${accent ? D.accentDeep : (h ? D.border : D.borderSoft)}`, transform: h ? "translateY(-1px)" : "none", transition: "transform .15s,border-color .15s", color: D.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16.5, fontWeight: 600, color: accent ? D.accent : D.text }}>{title}</span>
        <span style={{ fontFamily: mono, fontSize: 11.5, color: D.faint, whiteSpace: "nowrap" }}>{tag}</span>
      </div>
      <div style={{ color: D.muted, fontSize: 13.5, marginTop: 5 }}>{desc}</div>
      {typeof meter === "number" && (
        <div style={{ marginTop: 10, height: 4, background: D.borderSoft, borderRadius: 3, overflow: "hidden" }}>
          <div className="bar" style={{ width: `${meter}%`, height: "100%", background: scoreColor(meter * 10) }} />
        </div>
      )}
    </button>
  );
}

/* ================================================================== */
/*  INTRO (exam instructions, mirrors the pre-exam screen)           */
/* ================================================================== */
function Intro({ cfg, onBegin, onCancel }) {
  return (
    <div className="fade" style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px" }}>
      <div style={{ background: E.pane, border: `1px solid ${E.border}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 30px rgba(10,30,60,.12)" }}>
        <div style={{ background: E.bar, color: E.barText, padding: "14px 20px", fontWeight: 600, letterSpacing: 0.3 }}>
          Microsoft Azure Fundamentals — {cfg.label}
        </div>
        <div style={{ padding: "22px 22px 8px", color: E.text }}>
          <p style={{ marginTop: 0, fontSize: 15, lineHeight: 1.6 }}>You are about to begin a timed practice sitting. Read the format before you start.</p>
          <ul style={{ fontSize: 14.5, lineHeight: 1.8, color: E.sub, paddingLeft: 18 }}>
            <li><b style={{ color: E.text }}>{cfg.count} questions</b> in <b style={{ color: E.text }}>{cfg.minutes} minutes</b>. The timer runs continuously.</li>
            <li>You will <b style={{ color: E.text }}>not see whether an answer is correct</b> until you submit — just like the real exam.</li>
            <li>Use <b style={{ color: E.text }}>Previous / Next</b> to move, and <b style={{ color: E.text }}>Mark for review</b> to flag a question.</li>
            <li>A <b style={{ color: E.text }}>review screen</b> lets you revisit flagged or unanswered items before submitting.</li>
            <li>Unanswered questions score zero. There is <b style={{ color: E.text }}>no penalty</b> for wrong answers.</li>
            {cfg.domain ? null : <li>Pass mark is <b style={{ color: E.text }}>{PASS_MARK} / 1000</b>. Your score is scaled, not a raw percentage.</li>}
            <li>If time runs out, the exam submits automatically with your current answers.</li>
          </ul>
          <p style={{ fontSize: 12.5, color: E.sub, borderTop: `1px solid ${E.border}`, paddingTop: 14 }}>
            Practice questions are original and for study only — not Microsoft's exam content.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 20px", borderTop: `1px solid ${E.border}`, background: "#f7f9fc" }}>
          <button onClick={onCancel} style={outlineBtn}>Cancel</button>
          <button onClick={onBegin} style={fillBtn}>Begin exam</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  EXAM RUNNER (light testing UI)                                    */
/* ================================================================== */
function ExamRunner({ cfg, session, setSession, onSubmit }) {
  const { questions, answers, flags, idx } = session;
  const [secs, setSecs] = useState(cfg.minutes * 60);
  const [reviewing, setReviewing] = useState(false);
  const submittedRef = useRef(false);

  // countdown
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => {
      if (s <= 1) { clearInterval(t); if (!submittedRef.current) { submittedRef.current = true; onSubmit(true); } return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [onSubmit]);

  const setAnswer = (updater) => setSession((p) => {
    const answers = p.answers.map((a, i) => (i === p.idx ? updater(a) : a));
    return { ...p, answers };
  });
  const go = (n) => setSession((p) => ({ ...p, idx: Math.min(questions.length - 1, Math.max(0, n)) }));
  const toggleFlag = () => setSession((p) => { const f = [...p.flags]; f[p.idx] = !f[p.idx]; return { ...p, flags: f }; });

  const submit = () => { if (!submittedRef.current) { submittedRef.current = true; onSubmit(false); } };

  const answeredCount = questions.reduce((n, q, i) => n + (isAnswered(q, answers[i]) ? 1 : 0), 0);
  const low = secs <= 300, crit = secs <= 60;

  if (reviewing) {
    return (
      <ReviewGrid questions={questions} answers={answers} flags={flags} secs={secs} low={low} crit={crit}
        onJump={(i) => { go(i); setReviewing(false); }} onBack={() => setReviewing(false)} onSubmit={submit}
        answeredCount={answeredCount} />
    );
  }

  const q = questions[idx];
  const a = answers[idx];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #dee6ef 0%, #eef2f7 100%)", color: E.text, padding: "20px 12px 30px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", border: `1px solid ${E.border}`, boxShadow: "0 10px 30px rgba(14,28,52,.12)", background: "#f7f9fb", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: E.bar, color: E.barText, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 11.5, fontFamily: mono, letterSpacing: 1.5, opacity: 0.9 }}>AZ-900</div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{cfg.label}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 12.5, opacity: 0.9 }}>Question {idx + 1} of {questions.length}</span>
            <span style={{ fontFamily: mono, fontSize: 15, padding: "4px 10px", borderRadius: 5, fontWeight: 700,
              background: crit ? "#c0392b" : low ? "#e0952b" : "rgba(255,255,255,.14)", color: "#fff" }}>
              {fmtClock(secs)}
            </span>
          </div>
        </div>

        <div style={{ height: 4, background: "#dfe4ec" }}>
          <div className="bar" style={{ width: `${((idx + 1) / questions.length) * 100}%`, height: "100%", background: E.blue }} />
        </div>

        <div style={{ background: "#f7f9fb", padding: "22px 18px 0" }}>
          <div className="fade" key={idx} style={{ maxWidth: 820, margin: "0 auto", padding: "0 0 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, fontFamily: mono, color: E.blue, background: E.blueSoft, border: `1px solid #cfe0f5`, padding: "3px 9px", borderRadius: 4, fontWeight: 700 }}>
                Domain {DOMAINS[q.domain].short}
              </span>
              <span style={{ fontSize: 12.5, color: E.sub }}>{DOMAINS[q.domain].label}</span>
              <span style={{ fontSize: 11.5, color: E.sub, marginLeft: "auto", fontFamily: mono, textTransform: "uppercase", letterSpacing: .5 }}>{typeLabel(q)}</span>
            </div>

            <div style={{ background: "#fff", border: `1px solid ${E.border}`, borderRadius: 10, padding: "20px 22px 18px", boxShadow: "0 2px 12px rgba(14,28,52,.04)" }}>
              <QuestionBody q={q} a={a} setAnswer={setAnswer} />
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${E.border}`, background: "#f2f5f9" }}>
          <div style={{ maxWidth: 820, margin: "0 auto", padding: "12px 14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: flags[idx] ? E.flag : E.sub, cursor: "pointer", padding: "7px 10px", borderRadius: 6, background: flags[idx] ? E.flagSoft : "transparent", border: `1px solid ${flags[idx] ? "#f0d29a" : "transparent"}` }}>
              <input type="checkbox" checked={flags[idx]} onChange={toggleFlag} style={{ accentColor: E.flag }} />
              {flags[idx] ? "Marked for review" : "Mark for review"}
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={() => go(idx - 1)} disabled={idx === 0} style={{ ...navBtn, opacity: idx === 0 ? 0.4 : 1, minWidth: 118 }}>‹ Previous</button>
            <button onClick={() => setReviewing(true)} style={{ ...outlineBtn, minWidth: 104 }}>Review</button>
            {idx < questions.length - 1
              ? <button onClick={() => go(idx + 1)} style={{ ...fillBtn, minWidth: 118 }}>Next ›</button>
              : <button onClick={() => setReviewing(true)} style={{ ...fillBtn, minWidth: 150 }}>End &amp; review</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function typeLabel(q) {
  return { single: "Multiple choice", multi: "Multiple response", dragdrop: "Drag & drop", yesno: "Yes / No", dropdown: "Build sentence" }[q.type];
}

/* ---------------- question renderers ---------------- */
function QuestionBody({ q, a, setAnswer }) {
  if (q.type === "single" || q.type === "multi") return <ChoiceQ q={q} a={a} setAnswer={setAnswer} />;
  if (q.type === "dragdrop") return <DragQ q={q} a={a} setAnswer={setAnswer} />;
  if (q.type === "yesno") return <YesNoQ q={q} a={a} setAnswer={setAnswer} />;
  if (q.type === "dropdown") return <DropdownQ q={q} a={a} setAnswer={setAnswer} />;
  return null;
}

function ChoiceQ({ q, a, setAnswer }) {
  const multi = q.type === "multi";
  const toggle = (i) => setAnswer((prev) => {
    if (multi) { const s = new Set(prev.sel); s.has(i) ? s.delete(i) : s.add(i); return { sel: [...s] }; }
    return { sel: [i] };
  });
  return (
    <>
      <h2 style={{ ...qStyle, fontSize: 21, marginBottom: 18 }}>{q.q}</h2>
      {multi && <p style={hintStyle}>Select {q.correct.length} options.</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {q.options.map((opt, i) => {
          const on = a.sel.includes(i);
          return (
            <button key={i} onClick={() => toggle(i)} style={{
              ...optStyle(on),
              minHeight: 52,
              padding: "14px 16px",
              fontSize: 16,
              borderRadius: 8,
              boxShadow: on ? "inset 0 0 0 1px rgba(0,103,192,.15)" : "none"
            }}>
              <span style={optMark(on, multi)}>{on ? (multi ? "✓" : "●") : String.fromCharCode(65 + i)}</span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function YesNoQ({ q, a, setAnswer }) {
  const set = (si, val) => setAnswer((prev) => { const ans = [...prev.ans]; ans[si] = val; return { ans }; });
  return (
    <>
      <h2 style={qStyle}>{q.q}</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {q.statements.map((s, si) => (
          <div key={si} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `1px solid ${E.border}`, borderRadius: 8, background: E.pane, flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 200, fontSize: 14.5, lineHeight: 1.45 }}>{s.text}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[["Yes", true], ["No", false]].map(([lbl, val]) => (
                <button key={lbl} onClick={() => set(si, val)} style={{
                  padding: "7px 16px", borderRadius: 6, fontSize: 13.5, fontWeight: 600,
                  border: `1px solid ${a.ans[si] === val ? E.selBorder : E.borderStrong}`,
                  background: a.ans[si] === val ? E.sel : "#fff", color: a.ans[si] === val ? "#0a3d6e" : E.sub,
                }}>{lbl}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DropdownQ({ q, a, setAnswer }) {
  let blank = -1;
  const setPick = (bi, val) => setAnswer((prev) => { const pick = [...prev.pick]; pick[bi] = val; return { pick }; });
  return (
    <>
      {q.q && <h2 style={qStyle}>{q.q}</h2>}
      <div style={{ fontSize: 16, lineHeight: 2.1, background: E.pane, border: `1px solid ${E.border}`, borderRadius: 8, padding: "16px 18px" }}>
        {q.parts.map((p, i) => {
          if (!p.options) return <span key={i}>{p.text}</span>;
          blank += 1; const bi = blank;
          return (
            <select key={i} value={a.pick[bi] ?? ""} onChange={(e) => setPick(bi, e.target.value === "" ? null : Number(e.target.value))}
              style={{ margin: "0 4px", padding: "4px 8px", fontSize: 15, borderRadius: 6, border: `1px solid ${a.pick[bi] != null ? E.selBorder : E.borderStrong}`, background: a.pick[bi] != null ? E.blueSoft : "#fff", color: E.text, fontFamily: sans }}>
              <option value="">— choose —</option>
              {p.options.map((o, oi) => <option key={oi} value={oi}>{o}</option>)}
            </select>
          );
        })}
      </div>
    </>
  );
}

function DragQ({ q, a, setAnswer }) {
  const [held, setHeld] = useState(null); // token selected for tap-to-place
  const usedTokens = Object.values(a.map);
  const pool = q.tokens.filter((t) => !usedTokens.includes(t));

  const place = (token, ti) => setAnswer((prev) => {
    const map = { ...prev.map };
    // remove token from any existing slot
    Object.keys(map).forEach((k) => { if (map[k] === token) delete map[k]; });
    map[ti] = token;
    return { map };
  });
  const clearSlot = (ti) => setAnswer((prev) => { const map = { ...prev.map }; delete map[ti]; return { map }; });

  const onSlotClick = (ti) => {
    if (a.map[ti]) { clearSlot(ti); return; }
    if (held) { place(held, ti); setHeld(null); }
  };
  const onTokenClick = (t) => setHeld((h) => (h === t ? null : t));

  return (
    <>
      <h2 style={qStyle}>{q.q}</h2>
      <p style={hintStyle}>Drag a term onto a slot, or tap a term then tap its slot. Tap a filled slot to clear it.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px", border: `1px dashed ${E.borderStrong}`, borderRadius: 8, background: "#f7f9fc", minHeight: 52, marginBottom: 16 }}>
        {pool.length === 0 && <span style={{ color: E.sub, fontSize: 13 }}>All terms placed.</span>}
        {pool.map((t) => (
          <div key={t} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", t)}
            onClick={() => onTokenClick(t)}
            style={{ padding: "8px 13px", borderRadius: 7, fontSize: 14, fontWeight: 550, cursor: "grab",
              background: held === t ? E.sel : "#fff", border: `1px solid ${held === t ? E.selBorder : E.borderStrong}`, userSelect: "none" }}>
            {t}
          </div>
        ))}
      </div>

      {/* targets */}
      <div style={{ display: "grid", gap: 10 }}>
        {q.targets.map((t, ti) => {
          const val = a.map[ti];
          return (
            <div key={ti} style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", padding: "12px 14px", background: E.pane, border: `1px solid ${E.border}`, borderRadius: 8, fontSize: 14.5 }}>{t.label}</div>
              <div onClick={() => onSlotClick(ti)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const tok = e.dataTransfer.getData("text/plain"); if (tok) place(tok, ti); setHeld(null); }}
                style={{ width: 180, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px", borderRadius: 8, cursor: "pointer",
                  border: `1.5px ${val ? "solid" : "dashed"} ${val ? E.selBorder : (held ? E.blue : E.borderStrong)}`,
                  background: val ? E.sel : (held ? E.blueSoft : "#fafbfd"), color: val ? "#0a3d6e" : E.sub, fontWeight: val ? 600 : 400, fontSize: 14, textAlign: "center" }}>
                {val || (held ? "Tap to place here" : "Drop here")}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- review grid ---------------- */
function ReviewGrid({ questions, answers, flags, secs, low, crit, onJump, onBack, onSubmit, answeredCount }) {
  const [confirm, setConfirm] = useState(false);
  const unanswered = questions.length - answeredCount;
  const flagged = flags.filter(Boolean).length;
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", color: E.text }}>
      <div style={{ background: E.bar, color: E.barText, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Review</div>
        <span style={{ fontFamily: mono, fontSize: 15, padding: "3px 10px", borderRadius: 5, fontWeight: 600, background: crit ? "#c0392b" : low ? "#e0952b" : "rgba(255,255,255,.14)", color: "#fff" }}>{fmtClock(secs)}</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 40px" }}>
          <p style={{ fontSize: 14.5, color: E.sub, marginTop: 0 }}>
            {answeredCount} answered · <span style={{ color: unanswered ? E.bad : E.sub }}>{unanswered} unanswered</span> · <span style={{ color: flagged ? E.flag : E.sub }}>{flagged} flagged</span>. Tap any question to return to it.
          </p>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: E.sub, margin: "6px 0 16px", flexWrap: "wrap" }}>
            <Legend c="#fff" b={E.borderStrong} t="Unanswered" />
            <Legend c={E.sel} b={E.selBorder} t="Answered" />
            <Legend c={E.flagSoft} b="#f0d29a" t="Flagged" />
          </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(46px,1fr))", gap: 8 }}>
            {questions.map((q, i) => {
              const ans = isAnswered(q, answers[i]); const fl = flags[i];
              return (
                <button key={i} onClick={() => onJump(i)} style={{
                  aspectRatio: "1", borderRadius: 7, fontFamily: mono, fontSize: 14, fontWeight: 700,
                  border: `1.5px solid ${fl ? "#e0952b" : ans ? E.selBorder : E.borderStrong}`,
                  background: fl ? E.flagSoft : ans ? E.sel : "#fff", color: fl ? "#9a6410" : ans ? "#0a3d6e" : E.sub,
                  position: "relative",
                  boxShadow: fl ? "inset 0 0 0 1px rgba(224,149,43,.25)" : "none"
                }}>{i + 1}{fl && <span style={{ position: "absolute", top: 2, right: 4, fontSize: 9 }}>⚑</span>}</button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${E.border}`, background: E.pane }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "14px 16px", display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={onBack} style={outlineBtn}>‹ Back to questions</button>
          <div style={{ flex: 1 }} />
          {!confirm
            ? <button onClick={() => setConfirm(true)} style={{ ...fillBtn, background: E.good }}>Submit exam</button>
            : (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: E.sub }}>
                  {unanswered ? `${unanswered} unanswered will score zero. ` : ""}Submit now?
                </span>
                <button onClick={() => setConfirm(false)} style={outlineBtn}>Cancel</button>
                <button onClick={onSubmit} style={{ ...fillBtn, background: E.good }}>Confirm</button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
function Legend({ c, b, t }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: c, border: `1.5px solid ${b}` }} />{t}</span>;
}

/* ================================================================== */
/*  REPORT (dark) + answer review                                    */
/* ================================================================== */
function Report({ report, onHome, onRetry }) {
  const [tab, setTab] = useState("summary");
  const pct = Math.round((report.correct / report.total) * 100);
  const verdictColor = report.exam ? (report.passed ? D.good : D.bad) : scoreColor(report.score);

  return (
    <div className="fade" style={{ maxWidth: 760, margin: "0 auto", padding: "30px 18px 70px", color: D.text }}>
      <div style={{ textAlign: "center", padding: "30px 20px 26px", borderRadius: 14, background: D.surface, border: `1px solid ${D.borderSoft}`, borderTop: `3px solid ${verdictColor}` }}>
        <div style={{ color: D.muted, fontSize: 13, fontFamily: mono, textTransform: "uppercase", letterSpacing: 1.4 }}>{report.label}{report.timedOut ? " · time expired" : ""}</div>
        <div style={{ fontFamily: mono, fontSize: 58, fontWeight: 700, color: verdictColor, lineHeight: 1.05, marginTop: 6 }}>{report.score}</div>
        <div style={{ color: D.faint, fontSize: 13 }}>/ 1000 scaled · {report.correct} of {report.total} correct ({pct}%)</div>
        {report.exam && (
          <div style={{ marginTop: 14, display: "inline-block", padding: "6px 16px", borderRadius: 20, fontFamily: mono, fontSize: 13, letterSpacing: 1, background: report.passed ? D.goodBg : D.badBg, border: `1px solid ${report.passed ? D.good : D.bad}`, color: report.passed ? D.good : D.bad }}>
            {report.passed ? "PASS — at or above 700" : "BELOW PASS MARK (700)"}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, margin: "22px 0 14px" }}>
        <Tab on={tab === "summary"} onClick={() => setTab("summary")}>Domain breakdown</Tab>
        <Tab on={tab === "review"} onClick={() => setTab("review")}>Review answers</Tab>
      </div>

      {tab === "summary" ? (
        <div style={{ display: "grid", gap: 10 }}>
          {Object.entries(report.per).map(([d, v]) => {
            const p = Math.round((v.correct / v.total) * 100);
            return (
              <div key={d} style={{ border: `1px solid ${D.borderSoft}`, borderRadius: 10, padding: "12px 14px", background: D.surface }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                  <span style={{ fontWeight: 550 }}>{DOMAINS[d]?.label || d}</span>
                  <span style={{ fontFamily: mono, color: scoreColor(p * 10) }}>{v.correct}/{v.total}</span>
                </div>
                <div style={{ height: 5, background: D.borderSoft, borderRadius: 3, overflow: "hidden" }}>
                  <div className="bar" style={{ width: `${p}%`, height: "100%", background: scoreColor(p * 10) }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {report.review.map((r, i) => <ReviewItem key={i} n={i + 1} {...r} />)}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
        <button onClick={onHome} style={{ ...fillBtnDark, flex: 1, background: "transparent", border: `1px solid ${D.border}`, color: D.muted }}>Home</button>
        <button onClick={onRetry} style={{ ...fillBtnDark, flex: 1 }}>New sitting</button>
      </div>
    </div>
  );
}

function Tab({ on, onClick, children }) {
  return <button onClick={onClick} style={{ flex: 1, padding: "9px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, border: `1px solid ${on ? D.accentDeep : D.borderSoft}`, background: on ? "rgba(74,163,255,.1)" : D.surface, color: on ? D.accent : D.muted }}>{children}</button>;
}

function ReviewItem({ n, q, a, ok }) {
  return (
    <div style={{ border: `1px solid ${D.borderSoft}`, borderRadius: 10, background: D.surface, borderLeft: `3px solid ${ok ? D.good : D.bad}`, padding: "13px 15px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: ok ? D.good : D.bad }}>{n}. {ok ? "CORRECT" : "INCORRECT"}</span>
        <span style={{ fontSize: 11, color: D.faint, marginLeft: "auto" }}>{DOMAINS[q.domain].label}</span>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 550, marginBottom: 8, lineHeight: 1.4 }}>{q.q || "Complete the statement"}</div>
      <div style={{ fontSize: 13.5, color: D.muted, lineHeight: 1.5 }}>
        <AnswerSummary q={q} a={a} />
      </div>
      <div style={{ marginTop: 8, fontSize: 13.5, color: D.text, background: D.surface2, borderRadius: 7, padding: "9px 11px", lineHeight: 1.5 }}>
        <span style={{ color: D.accent, fontFamily: mono, fontSize: 11 }}>WHY </span>{q.ex}
      </div>
    </div>
  );
}

function AnswerSummary({ q, a }) {
  if (q.type === "single" || q.type === "multi") {
    const yours = a.sel.length ? a.sel.map((i) => q.options[i]).join(", ") : "— (blank)";
    const right = (Array.isArray(q.correct) ? q.correct : [q.correct]).map((i) => q.options[i]).join(", ");
    return <><Line label="Your answer" v={yours} /><Line label="Correct" v={right} good /></>;
  }
  if (q.type === "yesno") {
    return q.statements.map((s, i) => (
      <div key={i} style={{ marginBottom: 3 }}>
        <span style={{ color: a.ans[i] === s.ans ? D.good : D.bad }}>{a.ans[i] === null ? "—" : a.ans[i] ? "Yes" : "No"}</span>
        <span style={{ color: D.faint }}> (correct: {s.ans ? "Yes" : "No"}) — </span>{s.text}
      </div>
    ));
  }
  if (q.type === "dragdrop") {
    return q.targets.map((t, i) => {
      const yours = a.map[i]; const good = yours === t.token;
      return <div key={i} style={{ marginBottom: 3 }}>{t.label}: <span style={{ color: good ? D.good : D.bad }}>{yours || "—"}</span>{!good && <span style={{ color: D.faint }}> (correct: {t.token})</span>}</div>;
    });
  }
  if (q.type === "dropdown") {
    const blanks = q.parts.filter((p) => p.options);
    return blanks.map((b, i) => {
      const yours = a.pick[i] != null ? b.options[a.pick[i]] : "—"; const good = a.pick[i] === b.correct;
      return <div key={i} style={{ marginBottom: 3 }}>Blank {i + 1}: <span style={{ color: good ? D.good : D.bad }}>{yours}</span>{!good && <span style={{ color: D.faint }}> (correct: {b.options[b.correct]})</span>}</div>;
    });
  }
  return null;
}
function Line({ label, v, good }) {
  return <div><span style={{ color: D.faint }}>{label}: </span><span style={{ color: good ? D.good : D.text }}>{v}</span></div>;
}

/* ================================================================== */
/*  shared styles & utils                                            */
/* ================================================================== */
const qStyle = { fontSize: 19.5, fontWeight: 600, lineHeight: 1.45, margin: "0 0 16px", color: E.text };
const hintStyle = { fontSize: 13, color: E.sub, margin: "-8px 0 14px" };
const optStyle = (on) => ({ textAlign: "left", padding: "13px 14px", borderRadius: 9, background: on ? E.sel : E.pane, border: `1.5px solid ${on ? E.selBorder : E.border}`, color: E.text, display: "flex", gap: 11, alignItems: "flex-start", fontSize: 15, lineHeight: 1.4, width: "100%" });
const optMark = (on, multi) => ({ flexShrink: 0, width: 24, height: 24, borderRadius: multi ? 5 : "50%", border: `1.5px solid ${on ? E.selBorder : E.borderStrong}`, display: "grid", placeItems: "center", fontSize: 12, fontFamily: mono, color: on ? "#0a3d6e" : E.sub, marginTop: 1, background: "#fff" });

const fillBtn = { background: E.blue, color: "#fff", border: "none", padding: "9px 20px", borderRadius: 7, fontSize: 14.5, fontWeight: 600 };
const outlineBtn = { background: "#fff", color: E.blue, border: `1px solid ${E.blue}`, padding: "9px 16px", borderRadius: 7, fontSize: 14, fontWeight: 600 };
const navBtn = { background: "#fff", color: E.text, border: `1px solid ${E.borderStrong}`, padding: "9px 16px", borderRadius: 7, fontSize: 14 };
const fillBtnDark = { background: D.accent, color: "#04121f", border: "none", padding: "12px", borderRadius: 8, fontSize: 14.5, fontWeight: 600 };

function scoreColor(s) { return s >= 700 ? D.good : s >= 500 ? D.amber : D.bad; }
function fmtClock(s) { const m = Math.floor(s / 60), r = s % 60; return `${m}:${String(r).padStart(2, "0")}`; }
function fmtDate(ts) { const d = new Date(ts); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
