# Use the official Node.js 20 image
FROM node:20

# Set the working directory
WORKDIR /app

# Install Git
RUN apt-get update && apt-get install -y git && apt-get clean

# Clone the repository
RUN git clone https://github.com/AstroX10/xstro-pair .

# Install npm packages
RUN npm install

# Expose the application port
EXPOSE 7860

# Command to run the application
CMD ["node", "server.js"]
