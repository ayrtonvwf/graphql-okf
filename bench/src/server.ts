import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { addMocksToSchema } from "@graphql-tools/mock";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { createYoga } from "graphql-yoga";
import { SCHEMA_PATH } from "./constants.ts";

export interface MockServer {
  /** The GraphQL endpoint an MCP server should be pointed at. */
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Serves the shop schema over HTTP so the graphql-mcp scenario reflects how such
 * a server is really deployed: introspection against a live endpoint.
 *
 * Nothing in the benchmark asserts on response *values* — grading looks at which
 * operations and shapes the agent used — so generic mocks are sufficient.
 */
export async function startMockServer(): Promise<MockServer> {
  const typeDefs = await readFile(SCHEMA_PATH, "utf8");
  const schema = addMocksToSchema({ schema: makeExecutableSchema({ typeDefs }) });

  const yoga = createYoga({ schema, graphqlEndpoint: "/graphql", logging: false });
  const server = createServer(yoga);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Mock server did not bind to a TCP port");
  }

  return {
    url: `http://127.0.0.1:${address.port}/graphql`,
    async stop(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}
