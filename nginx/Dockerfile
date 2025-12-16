FROM nginx:alpine

# Copy nginx configuration into the image
COPY nginx.conf /etc/nginx/nginx.conf

# Create media content directory
RUN mkdir -p /media/content

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
