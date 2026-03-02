FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY build/ ./build/
ENV PORT=8007
EXPOSE 8007
CMD ["node", "build/server.js"]
