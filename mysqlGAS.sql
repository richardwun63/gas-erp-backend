-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: gas_erp_ayacucho
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `configuration`
--

DROP TABLE IF EXISTS `configuration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuration` (
  `config_key` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `config_value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_key`),
  KEY `idx_config_last_updated` (`last_updated`) -- Añadido índice para auditoría
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Almacena configuraciones generales (puntos, whatsapp, etc)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `configuration`
--

LOCK TABLES `configuration` WRITE;
/*!40000 ALTER TABLE `configuration` DISABLE KEYS */;
INSERT INTO `configuration` VALUES ('benefits_description','Por cada S/ 100 en compras acumulas 20 puntos. Al alcanzar 200 puntos obtienes S/ 20 de descuento en tu siguiente compra.','Texto mostrado al cliente sobre beneficios','2025-04-14 10:04:45'),('points_discount_value','20','Valor en soles de descuento al canjear puntos','2025-04-14 10:04:45'),('points_for_referral','50','Puntos ganados por un referido exitoso','2025-04-07 21:33:36'),('points_min_redeem','200','Cantidad mínima de puntos para poder canjear','2025-04-14 10:04:45'),('points_per_sol','0.2','Puntos de fidelidad ganados por cada Sol gastado','2025-04-14 10:04:45'),('whatsapp_number','51987654321','Número de WhatsApp para contacto (incluir código país 51)','2025-04-14 10:04:32');
/*!40000 ALTER TABLE `configuration` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

-- Primero creamos la tabla de roles y usuarios ya que serán referenciadas por otras tablas
DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `role_id` int NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'cliente, repartidor, base, contabilidad, gerente',
  `description` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `role_name` (`role_name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Define los tipos de usuarios del sistema';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'gerente','Gerente General - Acceso total'),(2,'repartidor','Personal de reparto a domicilio'),(3,'cliente','Usuario final que realiza pedidos'),(4,'base','Personal de central - Asigna pedidos, monitorea'),(5,'contabilidad','Personal de finanzas y facturación');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `warehouses`
--

DROP TABLE IF EXISTS `warehouses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `warehouses` (
  `warehouse_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Nombre del almacén (Principal, Norte, etc.)',
  `address` text COLLATE utf8mb4_unicode_ci COMMENT 'Dirección del almacén',
  `latitude` decimal(10,8) DEFAULT NULL COMMENT 'Coordenada para mapas',
  `longitude` decimal(11,8) DEFAULT NULL COMMENT 'Coordenada para mapas',
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`warehouse_id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_warehouses_active` (`is_active`) -- Añadido para filtrar activos
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Almacenes físicos de la empresa';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `warehouses`
--

LOCK TABLES `warehouses` WRITE;
/*!40000 ALTER TABLE `warehouses` DISABLE KEYS */;
INSERT INTO `warehouses` VALUES (1,'Principal (Centro)','Jr. Asamblea 456, Ayacucho',-13.15892300,-74.22563200,1),(2,'Almacén Norte','Av. Universitaria Km 3, Ayacucho',-13.14652100,-74.22431500,1),(3,'Almacén Sur','Carretera Quinua Km 5, Ayacucho',-13.17523400,-74.21345600,0);
/*!40000 ALTER TABLE `warehouses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Login (DNI, Celular, Usuario)',
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Contraseña SIEMPRE hasheada',
  `full_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number_primary` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone_number_secondary` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role_id` int NOT NULL,
  `photo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `schedule_start` time DEFAULT NULL COMMENT 'Hora inicio permitida para repartidores',
  `schedule_end` time DEFAULT NULL COMMENT 'Hora fin permitida para repartidores',
  `default_warehouse_id` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `login_attempts` int DEFAULT '0' COMMENT 'Contador de intentos fallidos',
  `last_login` timestamp NULL DEFAULT NULL COMMENT 'Última fecha de login exitoso',
  `password_reset_token` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Token para reseteo de contraseña',
  `password_reset_expires` timestamp NULL DEFAULT NULL COMMENT 'Expiración del token de reseteo',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `default_warehouse_id` (`default_warehouse_id`),
  KEY `idx_users_role` (`role_id`),
  KEY `idx_users_phone` (`phone_number_primary`),
  KEY `idx_users_active` (`is_active`), -- Añadido para filtrar usuarios activos
  KEY `idx_users_reset_token` (`password_reset_token`), -- Añadido para búsqueda de tokens
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE RESTRICT,
  CONSTRAINT `users_ibfk_2` FOREIGN KEY (`default_warehouse_id`) REFERENCES `warehouses` (`warehouse_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_login_attempts_nonnegative` CHECK (`login_attempts` >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Usuarios del sistema (empleados y clientes)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (6,'999111222','$2b$10$8bDS4FJQUgAF5F/b4K2pHev9GG.sAKH7ov.pI97Ice5msEhAxQvsu','Administrador Principal','999111222',NULL,'admin@gaserp.com',1,NULL,NULL,NULL,NULL,1,0,'2025-04-18 08:00:00',NULL,NULL,'2025-04-09 02:20:47','2025-04-18 08:00:00'),(9,'55555555','$2b$10$oqHPUo/t/RPWHLTHPCWZJuXq94fYgm9og4tHOuMmiIEBymLU/nXwe','nombreprueba','55555555',NULL,'1admin@gaserp.com',3,NULL,NULL,NULL,NULL,1,0,NULL,NULL,NULL,'2025-04-09 02:53:36','2025-04-09 02:53:36'),(10,'987654321','$2b$10$3GnvSZK3E5l5Y9a1hrOq2.Nw1kQexDZluz8/8WQr2tj.Rn3hULKRC','Cliente Desde Postman','987654321',NULL,'clientepostman@test.com',3,NULL,NULL,NULL,NULL,1,0,NULL,NULL,NULL,'2025-04-09 20:57:03','2025-04-09 20:57:03'),(11,'repartidor_nuevo','$2b$10$8bDS4FJQUgAF5F/b4K2pHev9GG.sAKH7ov.pI97Ice5msEhAxQvsu','Carlos Quispe Mendoza','911222333',NULL,'carlos.quispe@gaserp.com',2,NULL,'08:00:00','17:00:00',1,1,0,NULL,NULL,NULL,'2025-04-13 08:43:02','2025-04-13 08:43:02'),(12,'911111111','$2b$10$KwxXucRdeScW2DktwOSmL.dw5ySnr4pjf0najJnofxrB10o7PJj/q','Ana Flores Quispe','911111111',NULL,'ana.f@correo.com',3,NULL,NULL,NULL,NULL,1,0,NULL,NULL,NULL,'2025-04-13 09:21:05','2025-04-13 09:21:05'),(13,'922222222','$2b$10$81yP6KlEXfCemkDCwok4vekMoqBiktSIa4k.C5QzPB5ckg6OK3Tfy','Luis Pérez Cárdenas','922222222','933333333','luis.perez@empresa.com',3,NULL,NULL,NULL,NULL,1,0,NULL,NULL,NULL,'2025-04-13 09:22:55','2025-04-13 09:22:55'),(14,'933333333','$2b$10$7LduLTwvUXx6/i8ikOzGCuQgOZWCV.dF38qC/iwKEtdlxDCD6e.Lu','Maria Rojas Medina','933333333',NULL,NULL,4,NULL,NULL,NULL,NULL,1,0,NULL,NULL,NULL,'2025-04-13 09:23:10','2025-04-13 09:29:01'),(15,'944444444','$2b$10$zw6hImwTlwB1.yBLkCfQverG2dJGoHppxd9kqteefpNS3v.keqzMu','Restaurante \'El Sabor\'','944444444',NULL,'contacto@elsabor.com',3,NULL,NULL,NULL,NULL,1,0,NULL,NULL,NULL,'2025-04-13 09:23:24','2025-04-13 09:23:24');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `customer_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT 'FK a Users',
  `dni_ruc` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_type` enum('domicilio','restaurante','negocio','institucion','otro') COLLATE utf8mb4_unicode_ci DEFAULT 'domicilio' COMMENT 'Tipo de cliente',
  `address_text` text COLLATE utf8mb4_unicode_ci,
  `address_latitude` decimal(10,8) DEFAULT NULL,
  `address_longitude` decimal(11,8) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `loyalty_points` int DEFAULT '0',
  `referral_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referred_by_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_purchase_date` date DEFAULT NULL COMMENT 'Fecha de la última compra registrada',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`customer_id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `dni_ruc` (`dni_ruc`),
  UNIQUE KEY `referral_code` (`referral_code`),
  KEY `idx_customers_user` (`user_id`),
  KEY `idx_customers_type` (`customer_type`),
  KEY `idx_customers_birth_date` (`birth_date`), -- Añadido para búsqueda de cumpleaños
  KEY `idx_customers_referred` (`referred_by_code`), -- Añadido para consultas de referidos
  KEY `idx_customers_last_purchase` (`last_purchase_date`), -- Añadido para clientes inactivos
  CONSTRAINT `customers_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_loyalty_points_nonnegative` CHECK (`loyalty_points` >= 0) -- Evitar puntos negativos
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Detalles específicos de clientes';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customers`
--

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
INSERT INTO `customers` VALUES (1,6,'87654321','otro','Oficina Central, Ayacucho',NULL,NULL,NULL,0,'ADM892',NULL,NULL,'2025-04-09 02:20:47','2025-04-09 02:20:47'),(2,9,'12345678','otro','Oficina Central, Ayacucho',NULL,NULL,NULL,0,'NOM398',NULL,NULL,'2025-04-09 02:53:36','2025-04-09 02:53:36'),(3,10,'11223344','domicilio','Av. Postman 404, Ayacucho',-13.16123400,-74.22432100,'1990-01-20',0,'CLI698',NULL,NULL,'2025-04-09 20:57:03','2025-04-09 20:57:03'),(4,12,'71111111','domicilio','Av. Progreso 123, Ayacucho',NULL,NULL,'1995-05-15',0,'ANA715',NULL,NULL,'2025-04-13 09:21:05','2025-04-13 09:21:05'),(5,13,'72222222','negocio','Jr. Libertad 45, Huamanga',-13.16000000,-74.22500000,NULL,0,'LUI292',NULL,NULL,'2025-04-13 09:22:55','2025-04-13 09:22:55'),(6,14,'73333333','domicilio','Urb. Magisterial Mz A Lote 5',NULL,NULL,'2001-11-20',0,'MAR946',NULL,NULL,'2025-04-13 09:23:10','2025-04-13 09:23:10'),(7,15,'20111111111','restaurante','Portal Constitución 10, Plaza de Armas',NULL,NULL,NULL,0,'RES799',NULL,NULL,'2025-04-13 09:23:24','2025-04-13 09:23:24');
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cylindertypes`
--

-- Primero eliminamos la tabla si existe
DROP TABLE IF EXISTS `cylindertypes`;

-- Creamos la tabla correctamente
CREATE TABLE `cylindertypes` (
  `cylinder_type_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '5kg, 10kg, etc.',
  `description` text COLLATE utf8mb4_unicode_ci,
  `price_new` decimal(10,2) NOT NULL COMMENT 'Precio balón nuevo + gas',
  `price_exchange` decimal(10,2) NOT NULL COMMENT 'Precio recarga/intercambio',
  `price_loan` decimal(10,2) GENERATED ALWAYS AS (CASE WHEN `price_new` < 150 THEN (`price_new` * 0.6) ELSE (`price_new` * 0.5) END) STORED COMMENT 'Precio préstamo calculado',
  `is_available` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`cylinder_type_id`),
  UNIQUE KEY `name` (`name`),
  CONSTRAINT `chk_price_new_positive` CHECK (`price_new` > 0),
  CONSTRAINT `chk_price_exchange_positive_cyl` CHECK (`price_exchange` > 0),
  CONSTRAINT `chk_price_new_gt_exchange` CHECK (`price_new` > `price_exchange`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tipos de balones de gas';

-- Inserta valores correctamente sin especificar la columna price_loan
INSERT INTO `cylindertypes` (`cylinder_type_id`, `name`, `description`, `price_new`, `price_exchange`, `is_available`) 
VALUES 
(1, '5kg', NULL, 80.00, 25.00, 1),
(2, '10kg', NULL, 120.00, 48.50, 1),
(3, '15kg', NULL, 180.00, 70.00, 1),
(4, '45kg', NULL, 450.00, 210.00, 1);

-- En este caso, price_loan se calculará automáticamente según la expresión definida
-- para cada uno de los registros insertados
--
-- Dumping data for table `cylindertypes`
--

LOCK TABLES `cylindertypes` WRITE;
/*!40000 ALTER TABLE `cylindertypes` DISABLE KEYS */;
INSERT INTO `cylindertypes` VALUES (1,'5kg',NULL,80.00,25.00,48.00,1),(2,'10kg',NULL,120.00,48.50,72.00,1),(3,'15kg',NULL,180.00,70.00,90.00,1),(4,'45kg',NULL,450.00,210.00,225.00,1);
/*!40000 ALTER TABLE `cylindertypes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customerspecificprices`
--

DROP TABLE IF EXISTS `customerspecificprices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customerspecificprices` (
  `csp_id` int NOT NULL AUTO_INCREMENT,
  `customer_user_id` int NOT NULL COMMENT 'FK a Users (cliente)',
  `cylinder_type_id` int NOT NULL COMMENT 'FK a CylinderTypes',
  `price_exchange` decimal(10,2) NOT NULL COMMENT 'Precio especial para intercambio',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`csp_id`),
  UNIQUE KEY `uk_customer_cylinder` (`customer_user_id`,`cylinder_type_id`),
  KEY `cylinder_type_id` (`cylinder_type_id`),
  KEY `idx_prices_customer` (`customer_user_id`),
  CONSTRAINT `customerspecificprices_ibfk_1` FOREIGN KEY (`customer_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `customerspecificprices_ibfk_2` FOREIGN KEY (`cylinder_type_id`) REFERENCES `cylindertypes` (`cylinder_type_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_price_exchange_positive` CHECK (`price_exchange` > 0) -- Evitar precios negativos o cero
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Precios especiales por cliente y tipo de balón';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customerspecificprices`
--

LOCK TABLES `customerspecificprices` WRITE;
/*!40000 ALTER TABLE `customerspecificprices` DISABLE KEYS */;
/*!40000 ALTER TABLE `customerspecificprices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `customer_user_id` int NOT NULL COMMENT 'FK a Users',
  `order_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `order_status` enum('pending_approval','pending_assignment','assigned','delivering','delivered','cancelled','payment_pending','payment_late','paid') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending_approval',
  `warehouse_id` int DEFAULT NULL,
  `delivery_address_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `delivery_latitude` decimal(10,8) DEFAULT NULL,
  `delivery_longitude` decimal(11,8) DEFAULT NULL,
  `delivery_instructions` text COLLATE utf8mb4_unicode_ci,
  `subtotal_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `discount_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `voucher_code_used` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `receipt_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'URL del recibo/factura PDF',
  `payment_status` enum('pending','paid','partially_paid','late_payment_scheduled','refunded','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `points_earned` int DEFAULT '0',
  `points_redeemed` int DEFAULT '0',
  `referral_code_used` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  KEY `warehouse_id` (`warehouse_id`),
  KEY `idx_orders_customer` (`customer_user_id`),
  KEY `idx_orders_status` (`order_status`),
  KEY `idx_orders_payment` (`payment_status`),
  KEY `idx_orders_date` (`order_date`), -- Añadido para consultas por fecha
  KEY `idx_orders_voucher` (`voucher_code_used`), -- Añadido para validar vouchers usados
  KEY `idx_orders_referral` (`referral_code_used`), -- Añadido para rastrear referidos
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`customer_user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`warehouse_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_subtotal_nonnegative` CHECK (`subtotal_amount` >= 0),
  CONSTRAINT `chk_discount_nonnegative` CHECK (`discount_amount` >= 0),
  CONSTRAINT `chk_total_amount_valid` CHECK (`total_amount` = `subtotal_amount` - `discount_amount`),
  CONSTRAINT `chk_points_earned_nonnegative` CHECK (`points_earned` >= 0),
  CONSTRAINT `chk_points_redeemed_nonnegative` CHECK (`points_redeemed` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Cabecera de los pedidos de clientes';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orderitems`
--

DROP TABLE IF EXISTS `orderitems`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orderitems` (
  `order_item_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `item_id` int NOT NULL COMMENT 'ID (cylinder_type_id o product_id)',
  `item_type` enum('cylinder','other_product') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `action_type` enum('exchange','new_purchase','loan_purchase','sale') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Intercambio, Nuevo, Préstamo (balón); Venta (otro prod)',
  `unit_price` decimal(10,2) NOT NULL COMMENT 'Precio unitario al momento de compra',
  `item_subtotal` decimal(10,2) NOT NULL,
  PRIMARY KEY (`order_item_id`),
  KEY `idx_orderitems_order` (`order_id`),
  KEY `idx_orderitems_item` (`item_id`,`item_type`),
  KEY `idx_orderitems_action` (`action_type`), -- Añadido para filtrar por tipo de acción
  CONSTRAINT `orderitems_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_orderitems_quantity_positive` CHECK (`quantity` > 0),
  CONSTRAINT `chk_orderitems_unit_price_positive` CHECK (`unit_price` >= 0),
  CONSTRAINT `chk_orderitems_subtotal` CHECK (`item_subtotal` = `quantity` * `unit_price`) -- Asegurar cálculo correcto
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Detalle de los productos/balones en cada pedido';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orderitems`
--

LOCK TABLES `orderitems` WRITE;
/*!40000 ALTER TABLE `orderitems` DISABLE KEYS */;
/*!40000 ALTER TABLE `orderitems` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `otherproducts`
--

DROP TABLE IF EXISTS `otherproducts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `otherproducts` (
  `product_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Manguera, Válvula, etc.',
  `description` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(10,2) NOT NULL,
  `stock_unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'unidad' COMMENT 'Unidad de medida (unidad, metro, par)',
  `is_available` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`product_id`),
  UNIQUE KEY `name` (`name`),
  CONSTRAINT `chk_price_positive` CHECK (`price` > 0) -- Evitar precios negativos o cero
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Otros productos que se venden (accesorios)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `otherproducts`
--

LOCK TABLES `otherproducts` WRITE;
/*!40000 ALTER TABLE `otherproducts` DISABLE KEYS */;
INSERT INTO `otherproducts` VALUES (1,'Manguera Premium (mt)',NULL,8.00,'metro',1),(2,'Válvula Regular',NULL,15.00,'unidad',1),(3,'Abrazadera (par)',NULL,2.00,'par',1);
/*!40000 ALTER TABLE `otherproducts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `deliveries`
--

DROP TABLE IF EXISTS `deliveries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `deliveries` (
  `delivery_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `delivery_person_user_id` int DEFAULT NULL COMMENT 'FK a Users (repartidor)',
  `assigned_at` timestamp NULL DEFAULT NULL,
  `departed_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `collection_method` enum('cash','yape_plin','transfer','credit','cobro_pendiente','not_collected') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount_collected` decimal(10,2) DEFAULT NULL,
  `payment_proof_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scheduled_collection_time` time DEFAULT NULL COMMENT 'Hora agendada para regresar a cobrar',
  `delivery_notes` text COLLATE utf8mb4_unicode_ci,
  `has_issue` tinyint(1) DEFAULT '0' COMMENT 'Indica si hubo problema reportado',
  `issue_notes` text COLLATE utf8mb4_unicode_ci COMMENT 'Detalles del problema reportado',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`delivery_id`),
  UNIQUE KEY `order_id` (`order_id`),
  KEY `idx_deliveries_order` (`order_id`),
  KEY `idx_deliveries_repartidor` (`delivery_person_user_id`),
  KEY `idx_deliveries_completed_at` (`completed_at`), -- Añadido para consultas por fecha
  KEY `idx_deliveries_collection` (`collection_method`), -- Añadido para filtrar por método
  KEY `idx_deliveries_has_issue` (`has_issue`), -- Añadido para filtrar problemas
  CONSTRAINT `deliveries_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `deliveries_ibfk_2` FOREIGN KEY (`delivery_person_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_amount_collected_nonnegative` CHECK (`amount_collected` IS NULL OR `amount_collected` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Seguimiento logístico y de cobro de la entrega';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `deliveries`
--

LOCK TABLES `deliveries` WRITE;
/*!40000 ALTER TABLE `deliveries` DISABLE KEYS */;
/*!40000 ALTER TABLE `deliveries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `payment_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `amount` decimal(10,2) NOT NULL,
  `payment_method` enum('cash','yape_plin','transfer','points_redemption','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `transaction_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_proof_url_customer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verified_by_user_id` int DEFAULT NULL COMMENT 'FK a Users (contabilidad/base)',
  `verified_at` timestamp NULL DEFAULT NULL,
  `is_rejected` tinyint(1) DEFAULT '0' COMMENT 'Indica si fue rechazado',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci COMMENT 'Motivo de rechazo si aplica',
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`payment_id`),
  KEY `verified_by_user_id` (`verified_by_user_id`),
  KEY `idx_payments_order` (`order_id`),
  KEY `idx_payments_date` (`payment_date`),
  KEY `idx_payments_method` (`payment_method`),
  KEY `idx_payments_verification` (`verified_at`,`is_rejected`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE RESTRICT,
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`verified_by_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_payment_amount_positive` CHECK (`amount` > 0) -- Evitar pagos negativos o cero
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pagos efectivos registrados y verificados';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventorystock`
--

DROP TABLE IF EXISTS `inventorystock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventorystock` (
  `stock_id` int NOT NULL AUTO_INCREMENT,
  `warehouse_id` int NOT NULL COMMENT 'FK a Warehouses',
  `item_id` int NOT NULL COMMENT 'ID del item (puede ser cylinder_type_id o product_id)',
  `item_type` enum('cylinder','other_product') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Indica si es balón u otro producto',
  `status` enum('full','empty','damaged','loaned_to_customer','available') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Estado del item (full/empty/damaged/loaned para balones, available para otros)',
  `quantity` int NOT NULL DEFAULT '0',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`stock_id`),
  UNIQUE KEY `uk_warehouse_item_status` (`warehouse_id`,`item_id`,`item_type`,`status`) COMMENT 'Un registro por item/tipo/estado/almacén',
  KEY `idx_invstock_item` (`item_id`,`item_type`),
  KEY `idx_invstock_warehouse` (`warehouse_id`),
  KEY `idx_invstock_status` (`status`), -- Añadido para filtrar por estado
  CONSTRAINT `inventorystock_ibfk_1` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`warehouse_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_quantity_nonnegative` CHECK (`quantity` >= 0) -- Evitar stock negativo
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stock detallado por almacén, item y estado';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventorystock`
--

LOCK TABLES `inventorystock` WRITE;
/*!40000 ALTER TABLE `inventorystock` DISABLE KEYS */;
INSERT INTO `inventorystock` VALUES (1,1,1,'cylinder','full',20,'2025-04-18 08:30:00'),(2,1,1,'cylinder','empty',10,'2025-04-18 08:30:00'),(3,1,2,'cylinder','full',15,'2025-04-18 08:30:00'),(4,1,2,'cylinder','empty',8,'2025-04-18 08:30:00'),(5,1,3,'cylinder','full',12,'2025-04-18 08:30:00'),(6,1,3,'cylinder','empty',5,'2025-04-18 08:30:00'),(7,1,4,'cylinder','full',6,'2025-04-18 08:30:00'),(8,1,1,'other_product','available',25,'2025-04-18 08:30:00'),(9,1,2,'other_product','available',15,'2025-04-18 08:30:00'),(10,1,3,'other_product','available',30,'2025-04-18 08:30:00');
/*!40000 ALTER TABLE `inventorystock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventorylog`
--

DROP TABLE IF EXISTS `inventorylog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventorylog` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `warehouse_id` int NOT NULL,
  `item_id` int NOT NULL,
  `item_type` enum('cylinder','other_product') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status_changed_from` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status_changed_to` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity_change` int NOT NULL COMMENT '+ o -',
  `transaction_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Ej: refill, sale_exchange, sale_new, return_empty, adjustment, etc.',
  `related_order_id` int DEFAULT NULL,
  `related_delivery_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL COMMENT 'Usuario que realizó la acción',
  `log_timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`log_id`),
  KEY `warehouse_id` (`warehouse_id`),
  KEY `related_order_id` (`related_order_id`),
  KEY `related_delivery_id` (`related_delivery_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_invlog_timestamp` (`log_timestamp`), -- Añadido para consultas por fecha
  KEY `idx_invlog_item` (`item_type`, `item_id`), -- Añadido para consultas por item
  KEY `idx_invlog_transaction` (`transaction_type`), -- Añadido para filtrar por tipo
  CONSTRAINT `inventorylog_ibfk_1` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`warehouse_id`) ON DELETE CASCADE,
  CONSTRAINT `inventorylog_ibfk_2` FOREIGN KEY (`related_order_id`) REFERENCES `orders` (`order_id`) ON DELETE SET NULL,
  CONSTRAINT `inventorylog_ibfk_3` FOREIGN KEY (`related_delivery_id`) REFERENCES `deliveries` (`delivery_id`) ON DELETE SET NULL,
  CONSTRAINT `inventorylog_ibfk_4` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Auditoría de movimientos de inventario';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventorylog`
--

LOCK TABLES `inventorylog` WRITE;
/*!40000 ALTER TABLE `inventorylog` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventorylog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `loyaltytransactions`
--

DROP TABLE IF EXISTS `loyaltytransactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loyaltytransactions` (
  `loyalty_tx_id` int NOT NULL AUTO_INCREMENT,
  `customer_user_id` int NOT NULL,
  `transaction_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `points_change` int NOT NULL COMMENT '+ para ganar, - para canjear',
  `reason` enum('purchase_earn','referral_bonus_earn','referred_signup_earn','redemption_spend','manual_adjustment','promo_earn','birthday_bonus') COLLATE utf8mb4_unicode_ci NOT NULL,
  `related_order_id` int DEFAULT NULL,
  `related_user_id` int DEFAULT NULL COMMENT 'Ej: usuario referido',
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`loyalty_tx_id`),
  KEY `related_order_id` (`related_order_id`),
  KEY `related_user_id` (`related_user_id`),
  KEY `idx_loyalty_customer` (`customer_user_id`),
  KEY `idx_loyalty_date` (`transaction_date`), -- Añadido para informes por periodo
  KEY `idx_loyalty_reason` (`reason`), -- Añadido para filtrar por tipo
  CONSTRAINT `loyaltytransactions_ibfk_1` FOREIGN KEY (`customer_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `loyaltytransactions_ibfk_2` FOREIGN KEY (`related_order_id`) REFERENCES `orders` (`order_id`) ON DELETE SET NULL,
  CONSTRAINT `loyaltytransactions_ibfk_3` FOREIGN KEY (`related_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Historial de puntos de fidelidad';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `loyaltytransactions`
--

LOCK TABLES `loyaltytransactions` WRITE;
/*!40000 ALTER TABLE `loyaltytransactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `loyaltytransactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `maintenancerequests`
--

DROP TABLE IF EXISTS `maintenancerequests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenancerequests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `customer_user_id` int NOT NULL,
  `request_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('pending','scheduled','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `scheduled_date` datetime DEFAULT NULL,
  `assigned_technician` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `completed_date` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `idx_maintenance_customer` (`customer_user_id`),
  KEY `idx_maintenance_status` (`status`),
  KEY `idx_maintenance_scheduled_date` (`scheduled_date`),
  CONSTRAINT `maintenancerequests_ibfk_1` FOREIGN KEY (`customer_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Solicitudes de mantenimiento de clientes';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `maintenancerequests`
--

LOCK TABLES `maintenancerequests` WRITE;
/*!40000 ALTER TABLE `maintenancerequests` DISABLE KEYS */;
/*!40000 ALTER TABLE `maintenancerequests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supplierloanedstock`
--

DROP TABLE IF EXISTS `supplierloanedstock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supplierloanedstock` (
  `loan_id` int NOT NULL AUTO_INCREMENT,
  `cylinder_type_id` int NOT NULL COMMENT 'FK a CylinderTypes',
  `quantity` int NOT NULL COMMENT 'Cantidad prestada por el proveedor',
  `loan_date` date DEFAULT NULL,
  `supplier_info` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Nombre o referencia del proveedor',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`loan_id`),
  KEY `cylinder_type_id` (`cylinder_type_id`),
  KEY `idx_supplier_loan_date` (`loan_date`), -- Añadido para consultas por fecha
  CONSTRAINT `supplierloanedstock_ibfk_1` FOREIGN KEY (`cylinder_type_id`) REFERENCES `cylindertypes` (`cylinder_type_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_supplier_quantity_positive` CHECK (`quantity` > 0) -- Evitar cantidades negativas o cero
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Balones prestados POR el proveedor a la empresa';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplierloanedstock`
--

LOCK TABLES `supplierloanedstock` WRITE;
/*!40000 ALTER TABLE `supplierloanedstock` DISABLE KEYS */;
/*!40000 ALTER TABLE `supplierloanedstock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vouchers`
--

DROP TABLE IF EXISTS `vouchers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vouchers` (
  `voucher_id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Código del vale (DESCUENTO10)',
  `description` text COLLATE utf8mb4_unicode_ci,
  `discount_type` enum('percentage','fixed_amount') COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_value` decimal(10,2) NOT NULL COMMENT 'Valor (%) o monto fijo (S/)',
  `valid_from` date DEFAULT NULL,
  `valid_until` date DEFAULT NULL,
  `min_purchase_amount` decimal(10,2) DEFAULT NULL COMMENT 'Monto mínimo de compra para aplicar',
  `usage_limit` int DEFAULT NULL COMMENT 'Límite de usos totales',
  `usage_count` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`voucher_id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_vouchers_code` (`code`),
  KEY `idx_vouchers_validity` (`valid_from`,`valid_until`,`is_active`), -- Índice compuesto para validez
  CONSTRAINT `chk_discount_value_positive` CHECK (`discount_value` > 0),
  CONSTRAINT `chk_usage_count_nonnegative` CHECK (`usage_count` >= 0),
  CONSTRAINT `chk_min_purchase_positive` CHECK (`min_purchase_amount` IS NULL OR `min_purchase_amount` > 0),
  CONSTRAINT `chk_valid_dates` CHECK ((`valid_until` IS NULL) OR (`valid_from` IS NULL) OR (`valid_until` >= `valid_from`)) -- Validar que fecha fin sea posterior a fecha inicio
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vales de descuento disponibles';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vouchers`
--

LOCK TABLES `vouchers` WRITE;
/*!40000 ALTER TABLE `vouchers` DISABLE KEYS */;
/*!40000 ALTER TABLE `vouchers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Triggers to update related tables
--

DELIMITER ;;

-- Trigger para actualizar puntos de fidelidad del cliente
CREATE TRIGGER update_customer_loyalty_points_after_transaction
AFTER INSERT ON loyaltytransactions
FOR EACH ROW
BEGIN
  UPDATE customers 
  SET loyalty_points = loyalty_points + NEW.points_change,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.customer_user_id;
END;;

-- Trigger para actualizar la fecha de última compra
CREATE TRIGGER update_customer_last_purchase
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
  IF NEW.order_status = 'delivered' AND OLD.order_status != 'delivered' THEN
    UPDATE customers 
    SET last_purchase_date = CURRENT_DATE(),
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.customer_user_id;
  END IF;
END;;

DELIMITER ;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-04-18 14:25:05