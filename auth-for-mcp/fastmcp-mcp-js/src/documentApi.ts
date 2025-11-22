/**
 * Mock Document API
 * Simulates a remote document API with public/private document filtering
 */

export interface Document {
  id: string;
  title: string;
  content: string;
  public: boolean;
  createdAt: string;
  author: string;
}

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
   * @param publicOnly - When true, returns only public documents. When false/undefined, returns all documents.
   */
  async getDocuments(publicOnly?: boolean): Promise<Document[]> {
    if (publicOnly) {
      return this.documents.filter((doc) => doc.public === true);
    }
    return this.documents;
  }

}
