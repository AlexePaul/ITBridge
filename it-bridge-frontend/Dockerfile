FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Expose port for Nuxt dev server
EXPOSE 3000

# Run dev server with HMR enabled
CMD ["npm", "run", "dev"]
