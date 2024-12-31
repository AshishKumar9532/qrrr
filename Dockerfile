FROM quay.io/sampandey001/md:latest
RUN git clone https://github.com/Ashishkumar9532/qrrr/ /app
WORKDIR /app
RUN yarn install && yarn add http
CMD ["pm2", "index.js"]
