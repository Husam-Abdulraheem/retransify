// src/core/graph/helpers/memoryVectorStoreStub.js
/**
 * A simple lightweight, pure-JS in-memory VectorStore stub
 * since the LangChain bindings for memory vectors have been fragmented across
 * @langchain/community, @langchain/core and memory-vector-store leading to
 * ERR_PACKAGE_PATH_NOT_EXPORTED in ESM environments.
 */
export class MemoryVectorStore {
  constructor(embeddings) {
    this.embeddings = embeddings;
    this.memoryVectors = [];
  }

  static async fromDocuments(docs, embeddings) {
    const store = new MemoryVectorStore(embeddings);
    await store.addDocuments(docs);
    return store;
  }

  async addDocuments(docs) {
    if (this.embeddings && this.embeddings.embedDocuments) {
      const texts = docs.map((d) => d.pageContent);
      const vectors = await this.embeddings.embedDocuments(texts);

      const ids = docs.map((doc, i) => {
        const id = this.memoryVectors.length.toString();
        this.memoryVectors.push({
          id,
          content: doc.pageContent,
          embedding: vectors[i],
          metadata: doc.metadata || {},
        });
        return id;
      });
      return ids;
    } else {
      // Fallback: If embeddings are not initialized, just store text
      const ids = docs.map((doc) => {
        const id = this.memoryVectors.length.toString();
        this.memoryVectors.push({
          id,
          content: doc.pageContent,
          embedding: [],
          metadata: doc.metadata || {},
        });
        return id;
      });
      return ids;
    }
  }

  // Very basic cosine similarity stub for RAG context
  async similaritySearch(query, k = 3) {
    if (this.memoryVectors.length === 0) return [];

    let queryVector = [];
    if (this.embeddings && this.embeddings.embedQuery) {
      queryVector = await this.embeddings.embedQuery(query);
    }

    if (queryVector.length > 0) {
      const scored = this.memoryVectors.map((vec) => {
        const sim = this.cosineSimilarity(queryVector, vec.embedding);
        return { ...vec, score: sim };
      });

      scored.sort((a, b) => b.score - a.score);

      return scored.slice(0, k).map((v) => ({
        pageContent: v.content,
        metadata: v.metadata,
      }));
    } else {
      // Very crude fallback if embeddings aren't working
      return this.memoryVectors.slice(0, k).map((v) => ({
        pageContent: v.content,
        metadata: v.metadata,
      }));
    }
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
