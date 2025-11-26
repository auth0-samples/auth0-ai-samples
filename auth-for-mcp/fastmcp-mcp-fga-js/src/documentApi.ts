/**
 * Mock Document API
 * Simulates a remote document API with public/private document filtering
 */

/**
 * Represents a document in the system.
 * Documents can be either public (accessible to all) or private (requiring specific permissions).
 */
export interface Document {
  id: string;
  title: string;
  content: string;
  public: boolean;
  createdAt: string;
  author: string;
}

/**
 * Mock Document API for demonstrating authorization patterns with Auth0 and OpenFGA.
 * 
 * This class simulates a backend document management system to showcase:
 * - **Public vs Private Documents**: Documents are marked as either public (accessible to all)
 *   or private (requiring authorization checks via OpenFGA).
 * - **Authorization Integration**: Demonstrates how to integrate fine-grained authorization
 *   using FGA with Auth0 authentication in an MCP (Model Context Protocol) server.
 * - **Real-world Scenarios**: Models common use cases like:
 *   - Public documentation accessible without special permissions
 *   - Internal company documents requiring group membership
 *   - Confidential documents requiring specific access rights
 * 
 * The mock data includes 6 documents representing different access patterns:
 * - Public documents (doc-1, doc-3, doc-5): API docs, guides, release notes
 * - Private documents (doc-2, doc-4, doc-6): Internal handbook, security guidelines, financial reports
 * 
 * In a production scenario, the authorization checks would be performed by OpenFGA before
 * returning private documents to users.
 */
export class DocumentApi {
  private documents: Document[] = [
    {
      id: "doc-1",
      title: "Public API Documentation",
      content: "This document contains public API documentation that everyone can access.",
      public: true,
      createdAt: "2025-01-15T10:00:00Z",
      author: "admin",
    },
    {
      id: "doc-2",
      title: "Company Handbook",
      content: "This is the internal company handbook with policies and procedures.",
      public: false,
      createdAt: "2025-02-01T14:30:00Z",
      author: "hr-team",
    },
    {
      id: "doc-3",
      title: "Getting Started Guide",
      content: "A beginner's guide to using our platform. Open to all users.",
      public: true,
      createdAt: "2025-03-10T09:15:00Z",
      author: "support",
    },
    {
      id: "doc-4",
      title: "Internal Security Guidelines",
      content: "Confidential security guidelines for internal team members only.",
      public: false,
      createdAt: "2025-03-20T16:45:00Z",
      author: "security-team",
    },
    {
      id: "doc-5",
      title: "Release Notes - v2.0",
      content: "Public release notes for version 2.0 of our product.",
      public: true,
      createdAt: "2025-04-05T11:20:00Z",
      author: "product-team",
    },
    {
      id: "doc-6",
      title: "Financial Report Q1",
      content: "Quarterly financial report - confidential.",
      public: false,
      createdAt: "2025-04-15T08:00:00Z",
      author: "finance-team",
    },
  ];

  /**
   * Retrieves documents from the mock API with optional filtering.
   * 
   * This method demonstrates a common pattern where:
   * - **Public documents** are openly accessible without authorization (e.g., API documentation,
   *   getting started guides, public release notes)
   * - **Private documents** require authorization checks (e.g., internal handbooks,
   *   security guidelines, financial reports)
   * 
   * In a real implementation, the `publicOnly=false` case would trigger OpenFGA authorization
   * checks to verify the user has permission to access specific private documents.
   * 
   * @param includePrivate - When true, turns all documents. 
   *                         When false, returns only public documents.
   *                         
   * @returns A promise resolving to an array of documents matching the filter criteria.
   * 
   * @example
   * // Get only public documents (no auth required)
   * const publicDocs = await api.getDocuments(true);
   * 
   * @example
   * // Get all documents (would require OpenFGA authorization check in production)
   * const allDocs = await api.getDocuments(false);
   */
  async getDocuments(includePrivate: boolean): Promise<Document[]> {
    if (!includePrivate) {
      return this.documents.filter((doc) => doc.public === true);
    }
    return this.documents;
  }

}
